/**
 * AI Agent 聊天页面
 *
 * 包含聊天区域、任务中心和工作台布局
 * 支持内容创作模式下的布局过渡和步骤引导
 * 当主题为 general 时，使用 GeneralChat 组件实现
 */

import {
  startTransition,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ComponentProps,
} from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAgentChatUnified } from "./hooks";
import type { InterruptedInputRestoreRequest } from "./hooks/agentStreamInputRestoreTypes";
import { useFileManagerSidebar } from "./hooks/useFileManagerSidebar";
import { usePathReferences } from "./hooks/usePathReferences";
import { useWorkspaceWorkbenchRequests } from "./hooks/useWorkspaceWorkbenchRequests";
import { useSessionFiles } from "./hooks/useSessionFiles";
import { useContentSync } from "./hooks/useContentSync";
import { useDeveloperFeatureFlags } from "@/hooks/useDeveloperFeatureFlags";
import {
  readGlobalMediaGenerationDefaults,
  useGlobalMediaGenerationDefaults,
} from "@/hooks/useGlobalMediaGenerationDefaults";
import { useServiceModelsConfig } from "@/hooks/useServiceModelsConfig";
import { useSoulArtifactVoiceGenerationBrief } from "@/hooks/useSoulArtifactVoiceGenerationBrief";
import { useSoulInteractionCopy } from "@/hooks/useSoulInteractionCopy";
import { useTrayModelShortcuts } from "./hooks/useTrayModelShortcuts";
import { SettingsTabs } from "@/types/settings";
import { type CanvasWorkbenchLayoutMode } from "./components/CanvasWorkbenchLayout";
import type { CreationMode } from "./components/types";
import { type TaskFile } from "./components/TaskFiles";
import { createInitialVideoState } from "@/components/workspace/canvas/canvasUtils";
import {
  type CanvasState as GeneralCanvasState,
  DEFAULT_CANVAS_STATE,
} from "@/components/general-chat/bridge";
import {
  artifactsAtom,
  selectedArtifactAtom,
  selectedArtifactIdAtom,
} from "@/lib/artifact/store";
import type { Artifact } from "@/lib/artifact/types";
import { createPreviewArtifact } from "@/lib/artifact/previewArtifact";
import { useAtomValue, useSetAtom } from "jotai";
import { generateGeneralWorkbenchPrompt } from "@/lib/workspace/workbenchPrompt";
import { generateProjectMemoryPrompt } from "@/lib/workspace/workbenchPrompt";
import { buildClawAgentParams } from "@/lib/workspace/navigation";
import {
  cancelMediaTaskArtifact,
  createImageGenerationTaskArtifact,
  getMediaTaskArtifact,
} from "@/lib/api/mediaTasks";
import { logAgentDebug } from "@/lib/agentDebug";
import { type Character } from "@/lib/api/projectMemory";
import { useImageGen } from "@/components/image-gen/useImageGen";
import {
  resolveMediaGenerationPreference,
  type MediaGenerationDefaults,
} from "@/lib/mediaGeneration";
import { readTeamMemorySnapshot } from "@/lib/teamMemorySync";
import type { TaskCenterDraftSendRequest } from "./homePendingPreview";

import type {
  ConfirmResponse,
  Message,
  MessagePreviewTarget,
  SiteSavedContentTarget,
  WriteArtifactContext,
} from "./types";
import type { SearchResultPreviewItem } from "./utils/searchResultPreview";
import {
  isSpecializedWorkbenchTheme,
  type LayoutMode,
  type ThemeType,
} from "@/lib/workspace/workbenchContract";
import { normalizeProjectId } from "./utils/topicProjectResolution";
import {
  deriveHarnessSessionShellState,
  deriveHarnessSessionState,
  type HarnessSessionState,
} from "./utils/harnessState";
import { shouldUseCompactGeneralPromptForPreferences } from "./utils/chatToolPreferences";
import { buildRealSubagentTimelineItems } from "./utils/subagentTimeline";
import {
  buildGeneralAgentSystemPrompt,
  resolveAgentChatMode,
} from "./utils/generalAgentPrompt";
import {
  loadPersistedProjectId,
  loadPersistedSessionWorkspaceId,
} from "./hooks/agentProjectStorage";
import { useSelectedTeamPreference } from "./hooks/useSelectedTeamPreference";
import { useTeamMemoryShadowSync } from "./hooks/useTeamMemoryShadowSync";
import { useThemeScopedChatToolPreferences } from "./hooks/useThemeScopedChatToolPreferences";
import { useWorkspaceProjectSelection } from "./hooks/useWorkspaceProjectSelection";
import { useRuntimeTeamFormation } from "./hooks/useRuntimeTeamFormation";
import { mergeThreadItems } from "./utils/threadTimelineView";
import { openCanvasForReason } from "./workspace/canvasOpenPolicy";
import { useWorkbenchStore } from "@/stores/useWorkbenchStore";
import { GENERAL_BROWSER_ASSIST_ARTIFACT_ID } from "./workspace/browserAssistArtifact";
import { ServiceSkillExecutionCard } from "./workspace/ServiceSkillExecutionCard";
import { useWorkspaceBrowserAssistRuntime } from "./workspace/useWorkspaceBrowserAssistRuntime";
import { useWorkspaceA2UISubmitActions } from "./workspace/useWorkspaceA2UISubmitActions";
import { useWorkspaceContextHarnessRuntime } from "./workspace/useWorkspaceContextHarnessRuntime";
import { useWorkspaceHarnessInventoryRuntime } from "./workspace/useWorkspaceHarnessInventoryRuntime";
import { useExpertWorkspaceSkillRuntime } from "./workspace/useExpertWorkspaceSkillRuntime";
import { useWorkspaceCanvasWorkflowActions } from "./workspace/useWorkspaceCanvasWorkflowActions";
import { useWorkspaceCanvasSceneRuntime } from "./workspace/useWorkspaceCanvasSceneRuntime";
import { useWorkspaceCanvasMessageSyncRuntime } from "./workspace/useWorkspaceCanvasMessageSyncRuntime";
import { useWorkspaceConversationSceneRuntime } from "./workspace/useWorkspaceConversationSceneRuntime";
import { useWorkspaceInputbarSceneRuntime } from "./workspace/useWorkspaceInputbarSceneRuntime";
import { PlanComposerDecisionPanel } from "./workspace/PlanComposerDecisionPanel";
import { useWorkspaceNavigationActions } from "./workspace/useWorkspaceNavigationActions";
import { useWorkspaceWriteFileAction } from "./workspace/useWorkspaceWriteFileAction";
import { useWorkspaceArtifactPreviewActions } from "./workspace/useWorkspaceArtifactPreviewActions";
import { useWorkspaceCanvasLayoutRuntime } from "./workspace/useWorkspaceCanvasLayoutRuntime";
import { useSessionRecentMetadataSyncRuntime } from "./workspace/useSessionRecentMetadataSyncRuntime";
import { useWorkspaceMediaReferencePreviewRuntime } from "./workspace/useWorkspaceMediaReferencePreviewRuntime";
import { MediaReferencePreviewPaginationActions } from "./workspace/mediaReferencePreviewToolbarActions";
import { resolveMediaReferencePreviewPageRequest } from "./workspace/mediaReferencePreviewToolbarState";
import { useTaskCenterTabSessionRuntime } from "./workspace/useTaskCenterTabSessionRuntime";
import { useTaskCenterHomePendingPreviewRuntime } from "./workspace/useTaskCenterDraftSendRuntime";
import { useTaskCenterChromeNavigationRuntime } from "./workspace/useTaskCenterChromeNavigationRuntime";
import { useTaskCenterDraftMaterializationRuntime } from "./workspace/useTaskCenterDraftMaterializationRuntime";
import { useTaskCenterTopicNavigationRuntime } from "./workspace/useTaskCenterTopicNavigationRuntime";
import { useWorkspaceTaskCenterSendRuntime } from "./workspace/useWorkspaceTaskCenterSendRuntime";
import { useWorkspaceCanvasTaskFileSync } from "./workspace/useWorkspaceCanvasTaskFileSync";
import { useWorkspaceGeneralResourceSync } from "./workspace/useWorkspaceGeneralResourceSync";
import { useWorkspaceArtifactWorkbenchActions } from "./workspace/useWorkspaceArtifactWorkbenchActions";
import {
  useWorkspaceImageWorkbenchActionRuntime,
  type SubmitImageWorkbenchAgentCommandParams,
} from "./workspace/useWorkspaceImageWorkbenchActionRuntime";
import { useWorkspaceImageWorkbenchSessionRuntime } from "./workspace/useWorkspaceImageWorkbenchSessionRuntime";
import { useWorkspaceImageWorkbenchEventRuntime } from "./workspace/useWorkspaceImageWorkbenchEventRuntime";
import {
  buildImageCommandIntentRequestMetadata,
  resolveImageWorkbenchCommandRequest as resolveImageWorkbenchCommandRequestWithSelection,
} from "./workspace/imageCommandIntent";
import { ensureImageWorkbenchProviderSelectionCommitted } from "./workspace/imageWorkbenchProviderReadiness";
import { applyImagePreferenceToSendRouteSelection } from "./workspace/imageWorkbenchSendRoute";
import { useWorkspaceAudioTaskPreviewRuntime } from "./workspace/useWorkspaceAudioTaskPreviewRuntime";
import { useWorkspaceTranscriptionTaskPreviewRuntime } from "./workspace/useWorkspaceTranscriptionTaskPreviewRuntime";
import { useWorkspaceVideoTaskPreviewRuntime } from "./workspace/useWorkspaceVideoTaskPreviewRuntime";
import { useWorkspaceVideoTaskActionRuntime } from "./workspace/useWorkspaceVideoTaskActionRuntime";
import { useWorkspaceSessionRestore } from "./workspace/useWorkspaceSessionRestore";
import { useWorkspaceResetRuntime } from "./workspace/useWorkspaceResetRuntime";
import { useWorkspaceSendActions } from "./workspace/useWorkspaceSendActions";
import { buildInitialDispatchPreviewMessages } from "./workspace/workspaceSendHelpers";
import { useWorkspacePluginRuntimeContext } from "./workspace/useWorkspacePluginRuntimeContext";
import { buildWorkspacePluginInputSuggestions } from "./workspace/workspacePluginInputSuggestions";
import {
  buildWorkspacePluginHistoryRestoreProjection,
  hasWorkspacePluginHistoryRestoreMetadata,
} from "./workspace/workspacePluginHistoryRestoreRuntime";
import { WorkspacePluginHistoryRestoreLandingCard } from "./workspace/WorkspacePluginHistoryRestoreLandingCard";
import { buildWorkspacePluginHistoryRestoreLandingModel } from "./workspace/workspacePluginHistoryRestoreLanding";
import {
  buildWorkspacePluginHistoryRestoreArtifactPreviewArtifact,
  buildWorkspacePluginHistoryRestoreArtifactPreviewItems,
  type WorkspacePluginHistoryRestoreArtifactPreviewItem,
} from "./workspace/workspacePluginHistoryRestoreArtifacts";
import {
  useGeneralWorkbenchInitialAutoGuideRuntime,
  useGeneralWorkbenchInitialDispatchRuntime,
} from "./workspace/useGeneralWorkbenchInitialDispatchRuntime";
import { useWorkspaceTeamSessionControlRuntime } from "./workspace/useWorkspaceTeamSessionControlRuntime";
import { useWorkspaceGeneralWorkbenchScaffoldRuntime } from "./workspace/useWorkspaceGeneralWorkbenchScaffoldRuntime";
import { useWorkspaceTopicSwitch } from "./workspace/useWorkspaceTopicSwitch";
import { useWorkspaceA2UIRuntime } from "./workspace/useWorkspaceA2UIRuntime";
import { useWorkspaceSceneGateRuntime } from "./workspace/useWorkspaceSceneGateRuntime";
import {
  filterPlanComposerDecisionFromPendingActions,
  selectLatestPlanComposerDecision,
} from "./workspace/planComposerDecision";
import { selectPendingInputbarApprovalAction } from "./workspace/inputbarApprovalAction";
import {
  buildPlanImplementationSubmitPlan,
  hasProposedPlanImplementationSignals,
  readPlanImplementationConfirmationKeys,
  selectProposedPlanImplementationDecision,
} from "./workspace/planImplementationDecision";
import { useWorkspaceGeneralWorkbenchSidebarRuntime } from "./workspace/useWorkspaceGeneralWorkbenchSidebarRuntime";
import { useWorkspaceGeneralWorkbenchRuntime } from "./workspace/useWorkspaceGeneralWorkbenchRuntime";
import { useWorkspaceTeamSessionRuntime } from "./workspace/useWorkspaceTeamSessionRuntime";
import { useWorkspaceGeneralWorkbenchDocumentPersistenceRuntime } from "./workspace/useWorkspaceGeneralWorkbenchDocumentPersistenceRuntime";
import { useWorkspaceServiceSkillEntryActions } from "./workspace/useWorkspaceServiceSkillEntryActions";
import { useWorkspaceArtifactViewModeControl } from "./workspace/useWorkspaceArtifactViewModeControl";
import { useWorkspaceInitialSessionNavigation } from "./workspace/useWorkspaceInitialSessionNavigation";
import { resolveImageWorkbenchPreferenceViewModel } from "./workspace/imageWorkbenchPreference";
import { useWorkspaceOpenedProjectsRuntime } from "./workspace/useWorkspaceOpenedProjectsRuntime";
import { useWorkspaceProjectContentRuntime } from "./workspace/useWorkspaceProjectContentRuntime";
import { useWorkspaceHealthRuntime } from "./workspace/useWorkspaceHealthRuntime";
import { useWorkspaceDefaultProjectAliasRuntime } from "./workspace/useWorkspaceDefaultProjectAliasRuntime";
import { renderWorkspaceGeneralWorkbenchSidebarRuntime } from "./workspace/WorkspaceGeneralWorkbenchSidebarRuntime";
import { GeneralWorkbenchHarnessSurfaceSection } from "./workspace/WorkspaceHarnessDialogs";
import { useWorkspaceArticleEditorRightSurfaceRuntime } from "./workspace/useWorkspaceArticleEditorRightSurfaceRuntime";
import { useWorkspaceArticleEditorImageSlotRuntime } from "./workspace/useWorkspaceArticleEditorImageSlotRuntime";
import { WorkspaceShellScene } from "./workspace/WorkspaceShellScene";
import {
  resolveExpertInfoPanelCollapsedAfterLayoutChange,
} from "./workspace/right-surface";
import { useWorkspaceRightSurfaceHostRuntime } from "./workspace/useWorkspaceRightSurfaceHostRuntime";
import { renderWorkspaceFileManagerSidebarRuntime } from "./workspace/WorkspaceFileManagerSidebarRuntime";
import type { GeneralWorkbenchFollowUpActionPayload } from "./components/generalWorkbenchSidebarContract";
import { hasNamedGeneralCanvasFilePreview } from "./workspace/generalCanvasPreviewState";
import {
  hasPreferredServiceSkillResultFileTargetSignals,
  resolvePreferredServiceSkillResultFileTarget,
} from "./workspace/serviceSkillResultFileTarget";
import {
  isAbsoluteWorkspacePath,
  resolveAbsoluteWorkspacePath,
} from "./workspace/workspacePath";
import { buildGeneralCanvasStateFromWorkspaceFile } from "./workspace/workspaceFilePreview";
import { doesWorkspaceFileCandidateMatch } from "./workspace/workspaceFilePathMatch";
import {
  normalizeArtifactProtocolPath,
  resolveArtifactProtocolFilePath,
} from "@/lib/artifact-protocol";
import { saveAgentRuntimeArtifactDocumentSnapshot } from "@/lib/api/agentRuntime/appServerArtifactClient";
import { buildArtifactDocumentSaveEvidenceWriteContext } from "./workspace/workspaceArtifactDocumentSaveEvidence";
import { resolveSiteSavedContentTargetFromRunResult } from "./utils/siteToolResultSummary";
import type { ArtifactDocumentV1 } from "@/lib/artifact-document";
import type { ArtifactTimelineOpenTarget } from "./utils/artifactTimelineNavigation";
import { resolveInitialTaskSessionSwitchOptions } from "./utils/taskCenterTabs";
import { resolveImageWorkbenchStateForPreviewSelection } from "./workspace/imageWorkbenchPreviewSelection";
import { GENERAL_WORKBENCH_HISTORY_PAGE_SIZE } from "./workspace/generalWorkbenchHelpers";
import { normalizeInitialTheme } from "./agentChatWorkspaceShared";
import type { AgentChatWorkspaceProps } from "./agentChatWorkspaceContract";
import type {
  AgentInitialInputCapabilityParams,
  ExecutionPolicyFocusContext,
  ProviderSettingsFocusContext,
  SkillScaffoldDraft,
} from "@/types/page";
import type { ExpertSkillsManageOptions } from "./experts/ExpertSkillsSection";
import { extractCreationReplayMetadata } from "./utils/creationReplayMetadata";
import { buildCreationReplaySurfaceModel } from "./utils/creationReplaySurface";
import {
  buildRuntimeInitialInputCapabilityFromFollowUpAction,
  resolveEffectiveInitialInputCapability,
} from "./utils/inputCapabilityBootstrap";
import { buildKnowledgeSavePageParams } from "./workspace/knowledge/knowledgeSaveNavigation";
import { buildSkillsPageParamsFromMessage } from "./utils/skillScaffoldDraft";
import { resolveAgentChatWorkspaceShellViewModel } from "./agentChatWorkspaceShellViewModel";
import { resolveTaskCenterDraftSurfaceState } from "./workspace/taskCenterSurfaceState";
import { AutomationJobDialog } from "@/components/settings-v2/system/automation/AutomationJobDialog";
import { resolveWorkspaceShellChromeRuntime } from "./workspace/workspaceShellChromeRuntime";
import { resolveWorkspaceEntryLoadDeferral } from "./workspace/workspaceEntryLoadDeferral";
import { hasRunningThreadReadActivity } from "./workspace/workspaceSceneSessionProjection";
import { resolveWorkspaceBrowserAssistRequest } from "./workspace/workspaceBrowserAssistRequest";
import {
  resolveBrowserRuntimeNavigationFromBrowserAssist,
  resolveBrowserRuntimeNavigationFromSiteSkill,
} from "./workspace/workspaceBrowserRuntimeNavigation";
import {
  resolveExpertPanelRequestMetadata,
  resolveSessionExpertRequestMetadata,
  resolveWorkspaceRequestMetadataWithExpertSkills,
  shouldAllowDetachedInitialAutoSend,
} from "./workspace/workspaceExpertMetadata";
import { useWorkspaceRightSurfaceLocalStateRuntime } from "./workspace/useWorkspaceRightSurfaceLocalStateRuntime";
import { useWorkspaceRightSurfaceArtifactOpenRuntime } from "./workspace/useWorkspaceRightSurfaceArtifactOpenRuntime";
import { useWorkspaceRightSurfaceCoordinatorRuntime } from "./workspace/useWorkspaceRightSurfaceCoordinatorRuntime";
import { buildBrowserSessionRefFromBrowserAssistSessionState } from "./workspace/workspaceBrowserSessionRef";
import {
  createRestoredInteractiveMessageSnapshot,
  resolveReadOnlyInteractiveMessageIds,
} from "./workspace/workspaceRestoredInteractiveMessages";
import {
  EMPTY_WORKSPACE_WORKFLOW_STEPS,
  HIDDEN_WORKSPACE_WORKFLOW_STEP_INDEX,
  ignoreHiddenWorkspaceWorkflowStepClick,
  useWorkspaceHiddenWorkflowProgressRuntime,
} from "./workspace/useWorkspaceHiddenWorkflowProgressRuntime";
import { useWorkspaceDebugRuntime } from "./workspace/useWorkspaceDebugRuntime";
import { useWorkspaceClassicClawSidebarRuntime } from "./workspace/useWorkspaceClassicClawSidebarRuntime";
import { useWorkspaceChatToolPreferencesRuntime } from "./workspace/useWorkspaceChatToolPreferencesRuntime";
import { useWorkspaceSkillDirectoryRuntime } from "./workspace/useWorkspaceSkillDirectoryRuntime";
import { useWorkspaceSceneAppExecutionSurfaceRuntime } from "./workspace/useWorkspaceSceneAppExecutionSurfaceRuntime";
import { useWorkspaceHomeRecoveryRuntime } from "./workspace/useWorkspaceHomeRecoveryRuntime";
import { useWorkspaceExpertAgentLaunchSyncRuntime } from "./workspace/useWorkspaceExpertAgentLaunchSyncRuntime";
import {
  useWorkspaceArtifactStoreRuntime,
  useWorkspaceGeneralArtifactUpsert,
} from "./workspace/useWorkspaceArtifactStoreRuntime";
import {
  useWorkspaceActiveContentTargetRuntime,
  useWorkspaceEntryStateRuntime,
  useWorkspaceSoulArtifactVoiceTurnRuntime,
  useWorkspaceTaskFilesRefSyncRuntime,
} from "./workspace/useWorkspaceEntrySideEffectsRuntime";
import { useWorkspaceHarnessRequestMetadataRuntime } from "./workspace/useWorkspaceHarnessRequestMetadataRuntime";
import {
  useWorkspaceCanvasContentSyncRuntime,
  useWorkspaceDocumentVersionStatusSyncRuntime,
} from "./workspace/useWorkspaceDocumentSyncRuntime";
import { buildPendingServiceSkillLaunchSignature } from "./workspace/pendingServiceSkillLaunchSignature";
import { useInitialPendingServiceSkillLaunchRuntime } from "./workspace/useInitialPendingServiceSkillLaunchRuntime";
import {
  GENERAL_BROWSER_ASSIST_PROFILE_KEY,
  NOOP_SET_CHAT_MESSAGES,
  isUsableKnowledgeSourceText,
  normalizeVideoAspectRatio,
  normalizeVideoResolution,
  resolveDefaultSelectedArtifact,
  resolveHarnessRuntimeVisible,
  resolveRuntimeWorkspaceId,
  resolveTaskPreviewArtifact,
  resolveVideoCanvasStatusFromPreview,
  shouldAutoInitWorkspaceSessionFiles,
  shouldBuildFullThreadTimeline,
  shouldPauseTaskCenterInitialSessionNavigation,
  type TaskCenterDraftTab,
} from "./workspace/agentChatWorkspaceHelpers";

export type {
  AgentBackgroundSessionRuntimeSnapshot,
  AgentChatWorkspaceProps,
  WorkflowProgressSnapshot,
} from "./agentChatWorkspaceContract";

export function AgentChatWorkspace({
  onNavigate: _onNavigate,
  projectId: externalProjectId,
  contentId,
  initialSessionId,
  initialSceneAppExecutionSummary,
  initialRequestMetadata,
  initialAutoSendRequestMetadata,
  autoRunInitialPromptOnMount = false,
  agentEntry = "claw",
  theme: initialTheme,
  initialCreationMode,
  lockTheme = false,
  fromResources = false,
  showChatPanel = true,
  hideTopBar = false,
  topBarChrome = "full",
  onBackToProjectManagement,
  hideInlineStepProgress = false,
  onWorkflowProgressChange,
  initialUserPrompt,
  initialUserImages,
  initialSessionName: _initialSessionName,
  entryBannerMessage,
  initialPendingServiceSkillLaunch,
  initialInputCapability,
  initialKnowledgePackSelection,
  initialProjectFileOpenTarget,
  onInitialUserPromptConsumed,
  newChatAt,
  expertAgentLaunch,
  onRecommendationClick: _onRecommendationClick,
  onHasMessagesChange,
  onSessionChange,
  onAgentStreamingChange,
  onBackgroundSessionRuntimeChange,
  preferContentReviewInRightRail = false,
  openBrowserAssistOnMount = false,
  initialSiteSkillLaunch,
}: AgentChatWorkspaceProps) {
  const { t } = useTranslation("agent");
  const { t: tNavigation } = useTranslation("navigation");
  const untitledTaskLabel = t(
    "generalWorkbench.workflow.outputs.summary.untitledTask",
  );
  const taskCenterRenamePromptLabel = tNavigation(
    "navigation.sidebar.conversations.rename.prompt",
  );
  const newConversationLabel = "新对话";

  // 性能埋点：记录组件渲染开始时间
  const workspaceRenderT0 = useRef<number>(performance.now());
  useEffect(() => {
    console.info(
      `[PERF] AgentChatWorkspace mounted: ${(performance.now() - workspaceRenderT0.current).toFixed(0)}ms`,
    );
  }, []);

  const normalizedEntryTheme = normalizeInitialTheme(initialTheme);
  const shouldAutoCollapseClassicClawSidebar = agentEntry === "claw";
  const defaultTopicSidebarVisible =
    showChatPanel && !shouldAutoCollapseClassicClawSidebar;
  const [showSidebar, setShowSidebar] = useState(
    () => defaultTopicSidebarVisible,
  );
  const [input, setInput] = useState("");
  const {
    pathReferences,
    addPathReferences: handleAddPathReferences,
    removePathReference: handleRemovePathReference,
    clearPathReferences: handleClearPathReferences,
  } = usePathReferences();
  const [inputRestoreRequest, setInputRestoreRequest] =
    useState<InterruptedInputRestoreRequest | null>(null);
  const handleRestoreInterruptedInput = useCallback(
    (request: InterruptedInputRestoreRequest) => {
      logAgentDebug("AgentChatWorkspace", "inputRestoreRequest.received", {
        draftImageCount: request.draft.images?.length ?? 0,
        draftPathReferenceCount: request.draft.pathReferences?.length ?? 0,
        draftTextLength: request.draft.text.trim().length,
        hasCapabilityRoute: Boolean(request.draft.inputCapabilityRoute),
        reason: request.reason,
        requestId: request.requestId,
      });
      setInputRestoreRequest(request);
    },
    [],
  );
  const handleInputRestoreRequestHandled = useCallback((requestId: string) => {
    setInputRestoreRequest((current) =>
      current?.requestId === requestId ? null : current,
    );
  }, []);
  const handleCollapseTopicSidebarForFileManager = useCallback(() => {
    setShowSidebar(false);
  }, []);
  const fileManagerSidebar = useFileManagerSidebar({
    onCollapseTopicSidebar: handleCollapseTopicSidebarForFileManager,
  });
  const handleInstallSkillPackageFromFileManager = useCallback(
    (entry: { path: string; name: string }) => {
      _onNavigate?.("skills", {
        initialView: "installed",
        initialSkillPackagePath: entry.path,
        initialSkillPackageName: entry.name,
        initialSkillPackageRequestKey: Date.now(),
      });
    },
    [_onNavigate],
  );
  const handleOpenSkillsManageFromExpertPanel = useCallback(
    (options?: ExpertSkillsManageOptions) => {
      const searchQuery = options?.searchQuery?.trim();
      const scaffoldDraft: SkillScaffoldDraft | undefined =
        options?.scaffoldDraft;
      const requestKey = Date.now();
      _onNavigate?.("skills", {
        initialView: "installed",
        ...(searchQuery
          ? {
              initialSearchQuery: searchQuery,
              initialSearchRequestKey: requestKey,
            }
          : null),
        ...(scaffoldDraft
          ? {
              initialScaffoldDraft: scaffoldDraft,
              initialScaffoldRequestKey: requestKey,
            }
          : null),
      });
    },
    [_onNavigate],
  );
  const [runtimeInitialInputCapability, setRuntimeInitialInputCapability] =
    useState<AgentInitialInputCapabilityParams>();
  const [runtimeEntryBannerMessage, setRuntimeEntryBannerMessage] = useState<
    string | null
  >(null);
  const [selectedText, setSelectedText] = useState("");
  const effectiveEntryBannerMessage =
    runtimeEntryBannerMessage?.trim() || entryBannerMessage;
  const [entryBannerVisible, setEntryBannerVisible] = useState(
    Boolean(effectiveEntryBannerMessage),
  );
  const shouldBootstrapCanvasOnEntry =
    Boolean(contentId) && isSpecializedWorkbenchTheme(normalizedEntryTheme);
  const shouldKeepNewTaskHomeSessionRestoreDisabled =
    agentEntry === "new-task" && !contentId;

  // 内容创作相关状态
  const [activeTheme, setActiveTheme] = useState<string>(normalizedEntryTheme);
  const [creationMode, setCreationMode] = useState<CreationMode>(
    initialCreationMode ?? "guided",
  );
  const {
    activeSessionIdRef,
    chatToolPreferenceSessionSync,
    deferSessionRecentMetadataSyncForNavigation,
    selectedTeamSessionSync,
    syncSessionRecentPreferences,
  } = useSessionRecentMetadataSyncRuntime();
  const {
    chatToolPreferences,
    setChatToolPreferences,
    syncChatToolPreferencesSource,
    getSyncedSessionRecentPreferences,
  } = useThemeScopedChatToolPreferences(activeTheme, {
    sessionSync: chatToolPreferenceSessionSync,
  });
  const handleOpenSubagents = useCallback(() => {
    setChatToolPreferences((previous) =>
      previous.subagent ? previous : { ...previous, subagent: true },
    );
  }, [setChatToolPreferences]);
  const [inputbarObjectiveModeEnabled, setInputbarObjectiveModeEnabled] =
    useState(false);
  const {
    projectId,
    shouldDisableSessionRestore,
    hasHandledNewChatRequest,
    markNewChatRequestHandled,
    rememberProjectId,
    getRememberedProjectId,
    applyProjectSelection,
    resetProjectSelection,
    clearProjectSelectionRuntime,
    startTopicProjectResolution,
    finishTopicProjectResolution,
    deferTopicSwitch,
    consumePendingTopicSwitch,
  } = useWorkspaceProjectSelection({
    externalProjectId,
    initialSessionId,
    keepNewChatSessionRestoreDisabled:
      shouldKeepNewTaskHomeSessionRestoreDisabled,
    newChatAt,
  });
  const taskCenterWorkspaceId = normalizeProjectId(projectId);
  const normalizedInitialSessionId =
    typeof initialSessionId === "string" && initialSessionId.trim().length > 0
      ? initialSessionId.trim()
      : null;
  const sessionRestorePresentation =
    shouldKeepNewTaskHomeSessionRestoreDisabled && !normalizedInitialSessionId
      ? "background"
      : "foreground";
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    shouldBootstrapCanvasOnEntry ? "canvas" : "chat",
  );
  const [expertInfoPanelCollapsed, setExpertInfoPanelCollapsed] = useState(
    () => layoutMode !== "chat",
  );
  const {
    shouldPreserveEntryThemeOnHome,
    shouldPreserveBlankHomeSurface,
    shouldUseBrowserWorkspaceHomeChrome,
    shouldDeferWorkspaceAuxiliaryLoads,
    shouldDeferInitialTopicsLoad,
    shouldDeferInitialRuntimeWarmup,
    deferredWorkspaceAuxiliaryLoadMs,
    deferredInitialTopicsLoadMs,
    deferredInitialRuntimeWarmupMs,
  } = resolveWorkspaceEntryLoadDeferral({
    agentEntry,
    contentId,
    normalizedEntryTheme,
    normalizedInitialSessionId,
    initialUserPrompt,
    initialUserImages,
    initialSiteSkillLaunch,
    initialPendingServiceSkillLaunch,
    initialInputCapability,
    initialProjectFileOpenTarget,
  });
  const {
    project,
    setProject,
    projectMemory,
    setProjectMemory,
    isInitialContentLoading,
    initialContentLoadError,
    canvasState,
    setCanvasState,
    documentVersionStatusMap,
    setDocumentVersionStatusMap,
    contentMetadataRef,
    persistedWorkbenchSnapshotRef,
    lastCanvasSyncRequestRef,
  } = useWorkspaceProjectContentRuntime({
    projectId,
    contentId,
    externalProjectId,
    lockTheme,
    initialTheme,
    normalizedEntryTheme,
    shouldBootstrapCanvasOnEntry,
    shouldDeferWorkspaceAuxiliaryLoads,
    shouldPreserveEntryThemeOnHome,
    deferredWorkspaceAuxiliaryLoadMs,
    resetProjectSelection,
    setActiveTheme,
    setLayoutMode,
  });

  useWorkspaceEntryStateRuntime({
    effectiveEntryBannerMessage,
    entryBannerMessage,
    initialCreationMode,
    initialTheme,
    setActiveTheme,
    setCreationMode,
    setEntryBannerVisible,
    setRuntimeEntryBannerMessage,
  });

  useWorkspaceDefaultProjectAliasRuntime({
    applyProjectSelection,
    externalProjectId,
    getRememberedProjectId,
    projectId,
    resetProjectSelection,
    setProject,
  });

  const handledInitialPendingServiceSkillLaunchSignatureRef = useRef("");
  const dismissedInitialPendingServiceSkillLaunchSignatureRef = useRef("");
  const handledInitialProjectFileOpenSignatureRef = useRef("");
  const initialCreationReplay = useMemo(
    () => extractCreationReplayMetadata(initialRequestMetadata),
    [initialRequestMetadata],
  );
  const initialCreationReplaySurface = useMemo(
    () => buildCreationReplaySurfaceModel(initialCreationReplay),
    [initialCreationReplay],
  );

  useWorkspaceActiveContentTargetRuntime({
    canvasType: canvasState?.type ?? null,
    contentId,
    projectId,
  });

  // General 主题专用画布状态
  const [generalCanvasState, setGeneralCanvasState] =
    useState<GeneralCanvasState>(DEFAULT_CANVAS_STATE);

  // 任务文件状态
  const [taskFiles, setTaskFiles] = useState<TaskFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>();
  const taskFilesRef = useRef<TaskFile[]>([]);
  const socialStageLogRef = useRef<Record<string, string>>({});

  const { openedProjects, handleCloseOpenedProject } =
    useWorkspaceOpenedProjectsRuntime({
      enabled: !shouldDeferWorkspaceAuxiliaryLoads,
      project,
      projectId,
      applyProjectSelection,
      setProject,
      setProjectMemory,
    });
  const validatedRuntimeProjectId =
    normalizeProjectId(project?.id) === normalizeProjectId(projectId)
      ? projectId
      : undefined;
  const runtimeWorkspaceId = resolveRuntimeWorkspaceId(
    validatedRuntimeProjectId ?? taskCenterWorkspaceId,
  );
  const { clawTraceEnabled, workspaceHarnessEnabled } =
    useDeveloperFeatureFlags({
      enabled: !shouldDeferWorkspaceAuxiliaryLoads,
    });
  const { mediaDefaults, loading: mediaDefaultsLoading } =
    useGlobalMediaGenerationDefaults({
      enabled: !shouldDeferWorkspaceAuxiliaryLoads,
    });
  const [onDemandMediaDefaults, setOnDemandMediaDefaults] =
    useState<MediaGenerationDefaults>({});
  const {
    serviceModels,
    agentResponseLanguage,
    refresh: refreshServiceModelsConfig,
  } = useServiceModelsConfig({
    enabled: !shouldDeferWorkspaceAuxiliaryLoads,
  });
  const { generationBrief: soulArtifactVoiceGenerationBrief } =
    useSoulArtifactVoiceGenerationBrief({
      enabled: !shouldDeferWorkspaceAuxiliaryLoads,
    });
  const soulInteractionCopy = useSoulInteractionCopy({
    enabled: !shouldDeferWorkspaceAuxiliaryLoads,
  });
  const [soulArtifactVoiceEnabledForTurn, setSoulArtifactVoiceEnabledForTurn] =
    useState(true);
  useWorkspaceSoulArtifactVoiceTurnRuntime({
    generationBrief: soulArtifactVoiceGenerationBrief,
    setSoulArtifactVoiceEnabledForTurn,
  });
  const inputCompletionEnabled =
    serviceModels.input_completion?.enabled !== false;
  const effectiveGlobalImagePreference = shouldDeferWorkspaceAuxiliaryLoads
    ? (onDemandMediaDefaults.image ?? mediaDefaults.image)
    : (mediaDefaults.image ?? onDemandMediaDefaults.image);
  const effectiveImageWorkbenchPreference = useMemo(
    () =>
      resolveMediaGenerationPreference(
        project?.settings?.imageGeneration,
        effectiveGlobalImagePreference,
      ),
    [effectiveGlobalImagePreference, project?.settings?.imageGeneration],
  );
  const imageWorkbenchGenerationRuntime = useImageGen({
    preferredProviderId: effectiveImageWorkbenchPreference.preferredProviderId,
    preferredModelId: effectiveImageWorkbenchPreference.preferredModelId,
    allowFallback: effectiveImageWorkbenchPreference.allowFallback,
    providerLoadEnabled: !shouldDeferWorkspaceAuxiliaryLoads,
    providerLoadMode: shouldDeferWorkspaceAuxiliaryLoads
      ? "deferred"
      : "immediate",
    providerDeferredDelayMs: deferredWorkspaceAuxiliaryLoadMs,
    selectionScopeKey: `${externalProjectId ?? project?.id ?? "no-project"}:${initialSessionId ?? "no-session"}:${contentId ?? "no-content"}`,
  });
  const {
    selectedProvider: imageWorkbenchSelectedProvider,
    selectedProviderId: imageWorkbenchSelectedProviderId,
    selectedModel: imageWorkbenchSelectedModel,
    selectedModelId: imageWorkbenchSelectedModelId,
    selectedSize: imageWorkbenchSelectedSize,
    setSelectedSize: setImageWorkbenchSelectedSize,
    preferredProviderUnavailable: imageWorkbenchPreferredProviderUnavailable,
    ensureProvidersLoaded: ensureImageWorkbenchProvidersLoaded,
    providersLoading: imageWorkbenchProvidersLoading,
    saveImagesToResource: saveImageWorkbenchImagesToResource,
  } = imageWorkbenchGenerationRuntime;
  const imageWorkbenchPreferenceViewModel = useMemo(
    () =>
      resolveImageWorkbenchPreferenceViewModel({
        preference: effectiveImageWorkbenchPreference,
        selectedProvider: imageWorkbenchSelectedProvider,
        selectedProviderId: imageWorkbenchSelectedProviderId,
        selectedModel: imageWorkbenchSelectedModel,
        selectedModelId: imageWorkbenchSelectedModelId,
        preferredProviderUnavailable:
          imageWorkbenchPreferredProviderUnavailable,
        mediaDefaultsLoading,
        providersLoading: imageWorkbenchProvidersLoading,
      }),
    [
      effectiveImageWorkbenchPreference,
      imageWorkbenchProvidersLoading,
      imageWorkbenchPreferredProviderUnavailable,
      imageWorkbenchSelectedModel,
      imageWorkbenchSelectedModelId,
      imageWorkbenchSelectedProvider,
      imageWorkbenchSelectedProviderId,
      mediaDefaultsLoading,
    ],
  );
  const imageWorkbenchPreferenceSummary =
    imageWorkbenchPreferenceViewModel.preferenceSummary;
  const imageWorkbenchPreferenceWarning =
    imageWorkbenchPreferenceViewModel.preferenceWarning;
  const imageGenerationSelectionWarning =
    imageWorkbenchPreferenceViewModel.selectionWarning;
  const imageGenerationSelectionReady =
    imageWorkbenchPreferenceViewModel.selectionReady;
  const imageWorkbenchRequestProviderId =
    imageWorkbenchSelectedProviderId ||
    (!imageWorkbenchPreferredProviderUnavailable
      ? effectiveImageWorkbenchPreference.preferredProviderId
      : undefined);
  const imageWorkbenchRequestModelId =
    imageWorkbenchSelectedModelId ||
    (imageWorkbenchRequestProviderId &&
    (!effectiveImageWorkbenchPreference.preferredProviderId ||
      effectiveImageWorkbenchPreference.preferredProviderId ===
        imageWorkbenchRequestProviderId)
      ? effectiveImageWorkbenchPreference.preferredModelId
      : undefined);
  const imageWorkbenchSelectionRef = useRef({
    preferredProviderUnavailable: imageWorkbenchPreferredProviderUnavailable,
    providersLoading: imageWorkbenchProvidersLoading,
    requestModelId: imageWorkbenchRequestModelId,
    requestProviderId: imageWorkbenchRequestProviderId,
  });
  useEffect(() => {
    imageWorkbenchSelectionRef.current = {
      preferredProviderUnavailable: imageWorkbenchPreferredProviderUnavailable,
      providersLoading: imageWorkbenchProvidersLoading,
      requestModelId: imageWorkbenchRequestModelId,
      requestProviderId: imageWorkbenchRequestProviderId,
    };
  }, [
    imageWorkbenchPreferredProviderUnavailable,
    imageWorkbenchProvidersLoading,
    imageWorkbenchRequestModelId,
    imageWorkbenchRequestProviderId,
  ]);

  useWorkspaceTaskFilesRefSyncRuntime({
    taskFiles,
    taskFilesRef,
  });

  // 引用的角色列表（用于注入到消息中）
  const [mentionedCharacters, setMentionedCharacters] = useState<Character[]>(
    [],
  );
  const initialPendingServiceSkillLaunchSignature = useMemo(
    () =>
      buildPendingServiceSkillLaunchSignature(initialPendingServiceSkillLaunch),
    [initialPendingServiceSkillLaunch],
  );
  const {
    skills,
    skillsLoading,
    serviceSkills,
    serviceSkillGroups,
    serviceSkillsLoading,
    serviceSkillsError,
    recordServiceSkillUsage,
    handleRefreshSkills,
    handleSkillSuggestionsNeeded,
  } = useWorkspaceSkillDirectoryRuntime({
    activeTheme,
    autoLoadServiceSkills: Boolean(initialPendingServiceSkillLaunchSignature),
    deferredDelayMs: deferredWorkspaceAuxiliaryLoadMs,
    shouldDeferWorkspaceAuxiliaryLoads,
  });

  const initialAutoSendAllowsDetachedSession = useMemo(
    () => shouldAllowDetachedInitialAutoSend(initialAutoSendRequestMetadata),
    [initialAutoSendRequestMetadata],
  );
  // Workbench Store（用于工作区右侧技能面板状态同步）
  const pendingSkillKey = useWorkbenchStore((state) => state.pendingSkillKey);
  const clearThemeSkillsRailState = useWorkbenchStore(
    (state) => state.clearThemeSkillsRailState,
  );
  const consumePendingSkill = useWorkbenchStore(
    (state) => state.consumePendingSkill,
  );

  // 用于追踪已处理的消息 ID，避免重复处理
  const processedMessageIds = useRef<Set<string>>(new Set());
  // 文件写入回调 ref（用于传递给统一聊天主链 Hook）
  const handleWriteFileRef =
    useRef<
      (
        content: string,
        fileName: string,
        context?: WriteArtifactContext,
      ) => void
    >();
  const sceneGateResumeHandlerRef = useRef<
    (input: {
      rawText: string;
      requestMetadata: Record<string, unknown>;
    }) => Promise<boolean>
  >(async () => false);

  const mappedTheme = activeTheme as ThemeType;

  // 内容同步 Hook
  const { syncContent, syncStatus } = useContentSync({
    debounceMs: 2000,
    autoRetry: true,
    retryDelayMs: 5000,
  });

  // 判断是否为内容创作模式
  const isSpecializedThemeMode = isSpecializedWorkbenchTheme(activeTheme);

  // Artifact 状态 - 用于在画布中显示
  const artifacts = useAtomValue(artifactsAtom);
  const selectedArtifactId = useAtomValue(selectedArtifactIdAtom);
  const selectedArtifact = useAtomValue(selectedArtifactAtom);
  const setArtifacts = useSetAtom(artifactsAtom);
  const setSelectedArtifactId = useSetAtom(selectedArtifactIdAtom);
  const upsertGeneralArtifact = useWorkspaceGeneralArtifactUpsert({
    setArtifacts,
  });
  const hasBrowserAssistArtifact = useMemo(
    () =>
      artifacts.some(
        (artifact) =>
          artifact.id === GENERAL_BROWSER_ASSIST_ARTIFACT_ID &&
          artifact.type === "browser_assist",
      ),
    [artifacts],
  );
  const clearBrowserAssistCanvasArtifact = useCallback(() => {
    setArtifacts((currentArtifacts) => {
      const nextArtifacts = currentArtifacts.filter(
        (artifact) =>
          !(
            artifact.id === GENERAL_BROWSER_ASSIST_ARTIFACT_ID &&
            artifact.type === "browser_assist"
          ),
      );
      return nextArtifacts.length === currentArtifacts.length
        ? currentArtifacts
        : nextArtifacts;
    });

    if (selectedArtifactId === GENERAL_BROWSER_ASSIST_ARTIFACT_ID) {
      setSelectedArtifactId(null);
    }
  }, [selectedArtifactId, setArtifacts, setSelectedArtifactId]);
  const defaultSelectedArtifact = useMemo(
    () => resolveDefaultSelectedArtifact(activeTheme, artifacts),
    [activeTheme, artifacts],
  );
  const defaultSelectedArtifactId = defaultSelectedArtifact?.id ?? null;
  const preferGeneralCanvasFilePreview = useMemo(
    () =>
      activeTheme === "general" &&
      hasNamedGeneralCanvasFilePreview(generalCanvasState),
    [activeTheme, generalCanvasState],
  );
  const liveArtifact = useMemo(
    () =>
      preferGeneralCanvasFilePreview
        ? null
        : selectedArtifact || defaultSelectedArtifact,
    [defaultSelectedArtifact, preferGeneralCanvasFilePreview, selectedArtifact],
  );

  // Artifact 预览状态
  const [artifactPreviewSize, setArtifactPreviewSize] = useState<
    "mobile" | "tablet" | "desktop"
  >("desktop");
  const [canvasWorkbenchLayoutMode, setCanvasWorkbenchLayoutMode] =
    useState<CanvasWorkbenchLayoutMode>("split");
  const workbenchRequests = useWorkspaceWorkbenchRequests();

  // 跳转到技能主页面
  const handleNavigateToSkillSettings = useCallback(() => {
    _onNavigate?.("skills");
  }, [_onNavigate]);
  useEffect(() => {
    const normalizedProjectId = normalizeProjectId(projectId);
    if (!normalizedProjectId) {
      return;
    }

    if (project?.id === normalizedProjectId && project.isArchived) {
      return;
    }
    rememberProjectId(normalizedProjectId);
  }, [project, projectId, rememberProjectId]);

  const chatMode = useMemo(
    () => resolveAgentChatMode(mappedTheme, isSpecializedThemeMode),
    [isSpecializedThemeMode, mappedTheme],
  );
  const generalHarnessEntryEnabled = chatMode === "general";
  const shouldUseCompactGeneralSystemPrompt =
    shouldUseCompactGeneralPromptForPreferences({
      chatMode,
      contentId,
      preferences: chatToolPreferences,
    });

  // 生成系统提示词（包含项目 Memory）
  const systemPrompt = useMemo(() => {
    let prompt = "";

    if (chatMode === "general") {
      prompt = buildGeneralAgentSystemPrompt(mappedTheme, {
        compact: shouldUseCompactGeneralSystemPrompt,
        toolPreferences: chatToolPreferences,
        harness: {
          browserAssistEnabled: true,
          browserAssistProfileKey: GENERAL_BROWSER_ASSIST_PROFILE_KEY,
          contentId: contentId || null,
        },
      });
    } else if (isSpecializedThemeMode) {
      prompt = generateGeneralWorkbenchPrompt(mappedTheme, creationMode);
    }

    // 注入项目 Memory
    if (projectMemory) {
      const memoryPrompt = generateProjectMemoryPrompt(projectMemory);
      if (memoryPrompt) {
        prompt = prompt ? `${prompt}\n\n${memoryPrompt}` : memoryPrompt;
      }
    }

    return prompt || undefined;
  }, [
    chatMode,
    chatToolPreferences,
    contentId,
    creationMode,
    isSpecializedThemeMode,
    mappedTheme,
    projectMemory,
    shouldUseCompactGeneralSystemPrompt,
  ]);

  // 使用 Agent Chat Hook（传递系统提示词）
  const {
    providerType,
    setProviderType,
    model,
    setModel,
    reasoningEffort,
    setReasoningEffort,
    executionStrategy,
    accessMode,
    setAccessMode,
    messages = [],
    setMessages: setChatMessages = NOOP_SET_CHAT_MESSAGES,
    currentTurnId,
    turns = [],
    threadItems = [],
    todoItems = [],
    childSubagentSessions = [],
    subagentParentContext = null,
    queuedTurns = [],
    threadRead = null,
    executionRuntime = null,
    sessionWorkingDir = null,
    activeExecutionRuntime = null,
    isSending,
    sendMessage,
    compactSession = async () => undefined,
    stopSending,
    resumeThread = async () => false,
    replayPendingAction = async () => false,
    promoteQueuedTurn = async () => false,
    removeQueuedTurn = async () => false,
    clearMessages,
    deleteMessage,
    editMessage,
    handlePermissionResponse,
    pendingActions = [],
    submittedActionsInFlight = [],
    triggerAIGuide,
    topics = [],
    sessionHistoryWindow = null,
    isAutoRestoringSession = false,
    isSessionHydrating = false,
    sessionId,
    createFreshSession,
    ensureSession = async () => null,
    switchTopic: originalSwitchTopic,
    loadFullSessionHistory = async () => false,
    refreshSessionReadModel = async () => false,
    renameTopic,
    workspacePathMissing = false,
    fixWorkspacePathAndRetry,
    dismissWorkspacePathError,
  } = useAgentChatUnified({
    systemPrompt,
    onWriteFile: (content, fileName, context) => {
      // 使用 ref 调用最新的 handleWriteFile
      handleWriteFileRef.current?.(content, fileName, context);
    },
    workspaceId: runtimeWorkspaceId,
    workingDir: project?.rootPath || null,
    disableSessionRestore: shouldDisableSessionRestore,
    sessionRestorePresentation,
    initialTopicsLoadMode: shouldDeferInitialTopicsLoad
      ? "deferred"
      : "immediate",
    initialTopicsDeferredDelayMs: shouldDeferInitialTopicsLoad
      ? deferredInitialTopicsLoadMs
      : undefined,
    initialRuntimeWarmupLoadMode: shouldDeferInitialRuntimeWarmup
      ? "deferred"
      : "immediate",
    initialRuntimeWarmupDeferredDelayMs: shouldDeferInitialRuntimeWarmup
      ? deferredInitialRuntimeWarmupMs
      : undefined,
    getSyncedSessionRecentPreferences,
    onOpenSubagents: handleOpenSubagents,
    onRestoreInterruptedInput: handleRestoreInterruptedInput,
    clawTraceEnabled,
    soulCopy: soulInteractionCopy,
  });
  const { workspaceHealthError, setWorkspaceHealthError } =
    useWorkspaceHealthRuntime({
      enabled:
        !shouldDeferWorkspaceAuxiliaryLoads || Boolean(workspacePathMissing),
      project,
      projectId,
      workspacePathMissing,
      shouldDeferWorkspaceAuxiliaryLoads,
      deferredWorkspaceAuxiliaryLoadMs,
    });
  const activeSessionKey = sessionId?.trim() || null;
  const [
    threadExpertRequestMetadataOverride,
    setThreadExpertRequestMetadataOverride,
  ] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    setThreadExpertRequestMetadataOverride(null);
  }, [activeSessionKey, newChatAt]);
  const handleThreadExpertProfileSwitch = useCallback(
    (requestMetadata: Record<string, unknown>) => {
      setThreadExpertRequestMetadataOverride({ ...requestMetadata });
    },
    [],
  );
  const sessionExpertRequestMetadata = useMemo(
    () => resolveSessionExpertRequestMetadata(threadRead),
    [threadRead],
  );
  const baseExpertPanelRequestMetadata = useMemo(
    () =>
      resolveExpertPanelRequestMetadata({
        initialAutoSendRequestMetadata,
        initialRequestMetadata,
        sessionRequestMetadata: sessionExpertRequestMetadata,
      }),
    [
      initialAutoSendRequestMetadata,
      initialRequestMetadata,
      sessionExpertRequestMetadata,
    ],
  );
  const expertPanelRequestMetadata =
    threadExpertRequestMetadataOverride ?? baseExpertPanelRequestMetadata;
  const expertWorkspaceSkillRuntime = useExpertWorkspaceSkillRuntime({
    activeTheme,
    requestMetadata: expertPanelRequestMetadata,
    workspaceRoot: project?.rootPath,
    deferredDelayMs: shouldDeferWorkspaceAuxiliaryLoads
      ? deferredWorkspaceAuxiliaryLoadMs
      : undefined,
    onOpenSkillsManage: _onNavigate
      ? handleOpenSkillsManageFromExpertPanel
      : undefined,
  });
  const expertPanelRuntimeKey = expertWorkspaceSkillRuntime.runtimeKey;
  const workspaceSkillBindingsRuntime =
    expertWorkspaceSkillRuntime.bindingsRuntime;
  const expertWorkspaceSkillRuntimeEnableRefs =
    expertWorkspaceSkillRuntime.enabledRefs;
  const expertWorkspaceSkillRuntimeEnableBindings =
    expertWorkspaceSkillRuntime.enabledBindings;
  const expertWorkspaceSkillRuntimeEnableInput =
    expertWorkspaceSkillRuntime.enableInput;
  const handleEnableExpertWorkspaceSkillRuntime =
    expertWorkspaceSkillRuntime.handleEnableWorkspaceSkillRuntime;
  const pruneExpertWorkspaceSkillRuntimeEnableRefs =
    expertWorkspaceSkillRuntime.pruneEnabledRefsForSkillRefs;
  const combinedSkillsLoading =
    skillsLoading ||
    serviceSkillsLoading ||
    workspaceSkillBindingsRuntime.loading;
  const { expertSkillRefsOverride, handleExpertSkillRefsChange } =
    useWorkspaceExpertAgentLaunchSyncRuntime({
      expertAgentLaunch: threadExpertRequestMetadataOverride
        ? null
        : expertAgentLaunch,
      expertPanelRequestMetadata,
      pruneWorkspaceSkillRuntimeEnableRefs:
        pruneExpertWorkspaceSkillRuntimeEnableRefs,
    });
  const workspaceRequestMetadataWithExpertSkills = useMemo(
    () =>
      resolveWorkspaceRequestMetadataWithExpertSkills({
        activeRequestMetadata: threadExpertRequestMetadataOverride,
        expertSkillRefsOverride,
        initialAutoSendRequestMetadata,
        initialRequestMetadata,
        sessionRequestMetadata: sessionExpertRequestMetadata,
      }),
    [
      threadExpertRequestMetadataOverride,
      expertSkillRefsOverride,
      initialAutoSendRequestMetadata,
      initialRequestMetadata,
      sessionExpertRequestMetadata,
    ],
  );
  const [pluginSuggestionsEnabled, setPluginSuggestionsEnabled] =
    useState(false);
  const workspacePluginRuntimeContext = useWorkspacePluginRuntimeContext({
    enabled: pluginSuggestionsEnabled,
    requestMetadata: workspaceRequestMetadataWithExpertSkills ?? undefined,
  });
  const refreshWorkspacePluginRuntimeContext =
    workspacePluginRuntimeContext.refresh;
  const handlePluginSuggestionsNeeded = useCallback(() => {
    setPluginSuggestionsEnabled(true);
    refreshWorkspacePluginRuntimeContext();
  }, [refreshWorkspacePluginRuntimeContext]);
  const workspacePluginInputSuggestions = useMemo(
    () =>
      buildWorkspacePluginInputSuggestions(
        workspacePluginRuntimeContext.context,
      ),
    [workspacePluginRuntimeContext.context],
  );
  const workspacePluginHistoryRestoreAvailable = useMemo(
    () => hasWorkspacePluginHistoryRestoreMetadata(threadRead),
    [threadRead],
  );
  const workspacePluginHistoryRestoreProjection = useMemo(
    () =>
      workspacePluginHistoryRestoreAvailable
        ? buildWorkspacePluginHistoryRestoreProjection({
            threadRead,
            contracts: workspacePluginRuntimeContext.context.contracts,
            registryItems: workspacePluginRuntimeContext.context.registry,
          })
        : null,
    [
      threadRead,
      workspacePluginHistoryRestoreAvailable,
      workspacePluginRuntimeContext.context.contracts,
      workspacePluginRuntimeContext.context.registry,
    ],
  );
  const workspacePluginHistoryRestoreLandingModel = useMemo(
    () =>
      workspacePluginHistoryRestoreAvailable
        ? buildWorkspacePluginHistoryRestoreLandingModel({
            projection: workspacePluginHistoryRestoreProjection,
            contracts: workspacePluginRuntimeContext.context.contracts,
          })
        : null,
    [
      workspacePluginHistoryRestoreAvailable,
      workspacePluginHistoryRestoreProjection,
      workspacePluginRuntimeContext.context.contracts,
    ],
  );
  const workspacePluginHistoryRestoreArtifactPreviewItems = useMemo(
    () =>
      workspacePluginHistoryRestoreAvailable
        ? buildWorkspacePluginHistoryRestoreArtifactPreviewItems({
            projection: workspacePluginHistoryRestoreProjection,
            maxItems: 3,
          })
        : [],
    [
      workspacePluginHistoryRestoreAvailable,
      workspacePluginHistoryRestoreProjection,
    ],
  );
  const restoredInteractiveMessageSnapshotRef = useRef(
    createRestoredInteractiveMessageSnapshot(),
  );
  const readOnlyInteractiveMessageIds = useMemo<ReadonlySet<string>>(() => {
    return resolveReadOnlyInteractiveMessageIds({
      snapshot: restoredInteractiveMessageSnapshotRef.current,
      activeSessionKey,
      messages,
      normalizedInitialSessionId,
      isAutoRestoringSession,
      isSessionHydrating,
      isLoadingFullSessionHistory: sessionHistoryWindow?.isLoadingFull === true,
    });
  }, [
    activeSessionKey,
    isAutoRestoringSession,
    isSessionHydrating,
    messages,
    normalizedInitialSessionId,
    sessionHistoryWindow?.isLoadingFull,
  ]);
  const topicById = useMemo(
    () => new Map(topics.map((topic) => [topic.id, topic])),
    [topics],
  );
  activeSessionIdRef.current = sessionId;
  const { autoCollapsedTopicSidebarRef } =
    useWorkspaceClassicClawSidebarRuntime({
      contentId,
      externalProjectId,
      newChatAt,
      normalizedEntryTheme,
      sessionId,
      shouldAutoCollapseClassicClawSidebar,
      setShowSidebar,
    });
  const persistedTeamMemoryShadowSnapshot = useMemo(() => {
    const repoScope = project?.rootPath?.trim();
    if (!repoScope || typeof localStorage === "undefined") {
      return null;
    }

    return readTeamMemorySnapshot(localStorage, repoScope);
  }, [project?.rootPath]);
  const shouldAllowPersistedTeamFallback =
    !persistedTeamMemoryShadowSnapshot &&
    !executionRuntime?.recent_team_selection;

  const {
    selectedTeam,
    preferredTeamPresetId,
    selectedTeamLabel,
    selectedTeamSummary,
  } = useSelectedTeamPreference(activeTheme, {
    runtimeSelection: executionRuntime?.recent_team_selection ?? null,
    shadowSnapshot: persistedTeamMemoryShadowSnapshot,
    sessionSync: selectedTeamSessionSync,
    allowPersistedThemeFallback: shouldAllowPersistedTeamFallback,
  });
  const teamMemoryShadowSnapshot = useTeamMemoryShadowSync({
    repoScope: project?.rootPath || null,
    activeTheme,
    sessionId,
    selectedTeam,
    childSubagentSessions,
    subagentParentContext,
  });
  const resolvedTeamMemoryShadowSnapshot =
    teamMemoryShadowSnapshot ?? persistedTeamMemoryShadowSnapshot;
  const handleOpenSubagentSession = useCallback(
    (subagentSessionId: string) => {
      deferSessionRecentMetadataSyncForNavigation(subagentSessionId);
      void originalSwitchTopic(subagentSessionId);
    },
    [deferSessionRecentMetadataSyncForNavigation, originalSwitchTopic],
  );
  const effectiveChatToolPreferences = useWorkspaceChatToolPreferencesRuntime({
    activeTheme,
    chatToolPreferences,
    executionRuntime,
    executionStrategy,
    sessionId,
    setChatToolPreferences,
    syncChatToolPreferencesSource,
    syncSessionRecentPreferences,
  });

  const {
    clearRuntimeTeamState: clearPreparedRuntimeTeamState,
    prepareRuntimeTeamBeforeSend,
  } = useRuntimeTeamFormation({
    projectId,
    selectedTeam,
    subagentEnabled: effectiveChatToolPreferences.subagent,
  });
  const clearRuntimeTeamState = useCallback(() => {
    clearPreparedRuntimeTeamState();
  }, [clearPreparedRuntimeTeamState]);
  const {
    currentImageWorkbenchState,
    imageWorkbenchSessionKey,
    resetLocalImageWorkbenchSessionScope,
    updateCurrentImageWorkbenchState,
  } = useWorkspaceImageWorkbenchSessionRuntime({
    contentId,
    messages,
    projectId,
    sessionId,
  });
  useEffect(() => {
    if (!shouldDeferWorkspaceAuxiliaryLoads) {
      return;
    }
    if (
      !currentImageWorkbenchState.active &&
      currentImageWorkbenchState.tasks.length === 0
    ) {
      return;
    }

    ensureImageWorkbenchProvidersLoaded();
  }, [
    currentImageWorkbenchState.active,
    currentImageWorkbenchState.tasks.length,
    ensureImageWorkbenchProvidersLoaded,
    shouldDeferWorkspaceAuxiliaryLoads,
  ]);
  const teamSessionRuntime = useWorkspaceTeamSessionRuntime({
    sessionId,
    threadId: threadRead?.thread_id ?? sessionId,
    currentTurnId,
    topics,
    turns,
    queuedTurnCount: queuedTurns.length,
    isSending,
    subagentEnabled: effectiveChatToolPreferences.subagent,
    childSubagentSessions,
    subagentParentContext,
  });
  const teamSessionControlRuntime = useWorkspaceTeamSessionControlRuntime({
    sessionId,
    childSubagentSessions,
    liveRuntimeBySessionId: teamSessionRuntime.liveRuntimeBySessionId,
    stopSending,
  });
  useWorkspaceDebugRuntime({
    agentEntry,
    contentId,
    externalProjectId,
    initialCreationMode,
    initialTheme,
    lockTheme,
    stateSnapshot: {
      activeTheme,
      contentId: contentId ?? null,
      initialContentLoadError: initialContentLoadError ?? null,
      isAutoRestoringSession,
      isInitialContentLoading,
      isSessionHydrating,
      isSending,
      layoutMode,
      messagesCount: messages.length,
      projectId: projectId ?? null,
      sessionId: sessionId ?? null,
      skillsCount: skills.length,
      skillsLoading: combinedSkillsLoading,
      topicsCount: topics.length,
      workspaceHealthError,
    },
  });
  const {
    browserAssistLaunching,
    browserAssistSessionState,
    siteSkillExecutionState,
    currentBrowserAssistScopeKey,
    ensureBrowserAssistCanvas,
    suppressBrowserAssistCanvasAutoOpen,
    suppressGeneralCanvasArtifactAutoOpen,
  } = useWorkspaceBrowserAssistRuntime({
    activeTheme,
    projectId,
    sessionId,
    contentId,
    input,
    initialUserPrompt,
    openBrowserAssistOnMount,
    initialSiteSkillLaunch,
    siteSkillLaunchNonce: newChatAt,
    artifacts,
    messages,
    setLayoutMode,
    upsertGeneralArtifact,
    generalBrowserAssistProfileKey: GENERAL_BROWSER_ASSIST_PROFILE_KEY,
    onBrowserWorkbenchOpenRequest:
      workbenchRequests.requestBrowserWorkbenchOpen,
  });
  const browserAssistSessionRef = useMemo(
    () =>
      buildBrowserSessionRefFromBrowserAssistSessionState(
        browserAssistSessionState,
      ),
    [browserAssistSessionState],
  );
  const {
    activeArtifactViewTargetId,
    artifactDisplayState,
    currentCanvasArtifact,
    displayedCanvasArtifact,
    settledWorkbenchArtifacts,
  } = useWorkspaceArtifactStoreRuntime({
    activeTheme,
    artifacts,
    browserAssistScopeKey: currentBrowserAssistScopeKey,
    defaultSelectedArtifactId,
    isSending,
    liveArtifact,
    messages,
    preferGeneralCanvasFilePreview,
    selectedArtifact,
    selectedArtifactId,
    setArtifacts,
    setSelectedArtifactId,
    upsertGeneralArtifact,
  });
  const {
    artifactViewMode,
    applyAutoArtifactViewMode,
    handleArtifactViewModeChange,
  } = useWorkspaceArtifactViewModeControl({
    activeTheme,
    displayedArtifact: displayedCanvasArtifact,
    activeArtifactId: activeArtifactViewTargetId,
  });
  const {
    browserAssistRequestProfileKey,
    browserAssistRequestPreferredBackend,
    browserAssistRequestAutoLaunch,
  } = resolveWorkspaceBrowserAssistRequest({
    mappedTheme,
    initialAutoSendRequestMetadata,
    initialSiteSkillLaunch,
    browserAssistSessionState,
  });
  const handleOpenBrowserRuntimeForBrowserAssist = useCallback(
    (artifact?: Artifact) => {
      if (!_onNavigate) {
        toast.error("当前入口暂不支持打开浏览器工作台，请从桌面主界面重试。");
        return;
      }

      _onNavigate(
        "browser-runtime",
        resolveBrowserRuntimeNavigationFromBrowserAssist({
          artifact,
          browserSessionRef: browserAssistSessionRef,
          browserAssistSessionState,
          contentId,
          generalBrowserAssistProfileKey: GENERAL_BROWSER_ASSIST_PROFILE_KEY,
          projectId,
        }),
      );
    },
    [
      _onNavigate,
      browserAssistSessionRef,
      browserAssistSessionState,
      contentId,
      projectId,
    ],
  );
  const handleOpenBrowserRuntimeForSiteSkillExecution = useCallback(() => {
    if (!_onNavigate || !initialSiteSkillLaunch?.adapterName?.trim()) {
      return;
    }

    _onNavigate(
      "browser-runtime",
      resolveBrowserRuntimeNavigationFromSiteSkill({
        contentId,
        initialSiteSkillLaunch,
        projectId,
        siteSkillExecutionState,
      }),
    );
  }, [
    contentId,
    initialSiteSkillLaunch,
    _onNavigate,
    projectId,
    siteSkillExecutionState,
  ]);
  const harnessShellState = useMemo(
    () => deriveHarnessSessionShellState(messages, pendingActions, todoItems),
    [messages, pendingActions, todoItems],
  );
  useEffect(() => {
    onSessionChange?.(sessionId ?? null);
  }, [onSessionChange, sessionId]);

  useEffect(() => {
    return () => {
      onAgentStreamingChange?.(false);
    };
  }, [onAgentStreamingChange]);

  const contextHarnessRuntime = useWorkspaceContextHarnessRuntime({
    enabled: workspaceHarnessEnabled || generalHarnessEntryEnabled,
    prefetchEnabled: false,
    projectId,
    activeTheme,
    messages,
    providerType,
    model,
    mappedTheme,
    isSending,
    projectMemory,
    harnessState: harnessShellState,
  });
  const rightSurfaceLocalState = useWorkspaceRightSurfaceLocalStateRuntime();
  const { manualRightSurface, openArticleWorkspaceRightSurface } =
    rightSurfaceLocalState;
  const {
    contextWorkspace,
    isThemeWorkbench,
    harnessPanelVisible,
    setHarnessPanelVisible,
    harnessPendingCount,
    showHarnessToggle,
    harnessAttentionLevel,
    harnessToggleLabel,
  } = contextHarnessRuntime;
  const harnessRuntimeVisible = resolveHarnessRuntimeVisible({
    harnessPanelVisible,
    rightSurfaceActive: manualRightSurface,
  });
  const needsFullThreadTimeline = shouldBuildFullThreadTimeline({
    harnessPanelVisible: harnessRuntimeVisible,
    layoutMode,
  });
  const realSubagentTimelineItems = useMemo(
    () =>
      needsFullThreadTimeline
        ? buildRealSubagentTimelineItems({
            threadId: threadRead?.thread_id ?? sessionId,
            turns,
            childSessions: childSubagentSessions,
          })
        : [],
    [
      childSubagentSessions,
      needsFullThreadTimeline,
      sessionId,
      threadRead?.thread_id,
      turns,
    ],
  );
  const effectiveThreadItems = useMemo(
    () =>
      needsFullThreadTimeline
        ? mergeThreadItems(threadItems, realSubagentTimelineItems)
        : threadItems,
    [needsFullThreadTimeline, realSubagentTimelineItems, threadItems],
  );
  const generalWorkbenchScaffoldRuntime =
    useWorkspaceGeneralWorkbenchScaffoldRuntime({
      isGeneralWorkbench: isThemeWorkbench,
      mappedTheme,
      sessionId,
      projectId,
      canvasState,
      documentVersionStatusMap,
      setDocumentVersionStatusMap,
      clearThemeSkillsRailState,
      setCanvasState,
      setLayoutMode,
    });
  const {
    shouldUseCompactGeneralWorkbench,
    shouldSkipGeneralWorkbenchAutoGuideWithoutPrompt,
    setTopicStatus,
  } = generalWorkbenchScaffoldRuntime;

  useWorkspaceGeneralWorkbenchDocumentPersistenceRuntime({
    isThemeWorkbench,
    contentId,
    canvasState,
    documentVersionStatusMap,
    contentMetadataRef,
    persistedWorkbenchSnapshotRef,
  });

  const workspaceServiceSkillEntryActions =
    useWorkspaceServiceSkillEntryActions({
      activeTheme,
      creationMode,
      projectId,
      contentId,
      sessionId,
      threadId: threadRead?.thread_id ?? sessionId,
      ensureSessionForThreadLineage: ensureSession,
      input,
      chatToolPreferences: effectiveChatToolPreferences,
      creationReplay: initialCreationReplay,
      preferredTeamPresetId,
      selectedTeam,
      selectedTeamLabel,
      selectedTeamSummary,
      onNavigate: _onNavigate,
      recordServiceSkillUsage,
    });
  const handlePendingServiceSkillLaunchSubmit =
    workspaceServiceSkillEntryActions.handlePendingServiceSkillLaunchSubmit;
  const clearPendingServiceSkillLaunch =
    workspaceServiceSkillEntryActions.clearPendingServiceSkillLaunch;
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
    onSelectServiceSkill:
      workspaceServiceSkillEntryActions.handleServiceSkillSelect,
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
  const pendingServiceSkillLaunchForm =
    workspaceServiceSkillEntryActions.pendingServiceSkillLaunchForm;
  const pendingServiceSkillLaunchSource =
    workspaceServiceSkillEntryActions.pendingServiceSkillLaunchSource;
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
    creationReplay: initialCreationReplay,
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
  const suppressCanvasAutoOpenForPendingA2UI = hasPendingA2UIForm;
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
    initialPendingServiceSkillLaunchSignature,
  ]);

  const {
    currentGate,
    documentEditorFocusedRef,
    themeWorkbenchActiveQueueItem,
    themeWorkbenchBackendRunState,
    themeWorkbenchRunState,
  } = useWorkspaceGeneralWorkbenchRuntime({
    isThemeWorkbench,
    sessionId,
    isSending,
    pendingActionRequest,
  });

  const handleViewContextDetail = useCallback(
    (contextId: string) => {
      const detail = contextWorkspace.getContextDetail(contextId);
      if (!detail) {
        toast.error(t("generalWorkbench.context.detail.notFound"));
        return;
      }

      let sourceLabel = t("generalWorkbench.context.source.web");
      if (detail.source === "material") {
        sourceLabel = t("generalWorkbench.context.source.material");
      } else if (detail.source === "content") {
        sourceLabel = t("generalWorkbench.context.source.content");
      } else if (detail.searchMode === "social") {
        sourceLabel = t("generalWorkbench.context.source.social");
      }

      toast.info(
        <div style={{ maxWidth: "500px" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>
            {detail.name}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "hsl(var(--muted-foreground))",
              marginBottom: "8px",
            }}
          >
            {t("generalWorkbench.context.detail.sourceTokens", {
              source: sourceLabel,
              tokens: detail.estimatedTokens,
            })}
          </div>
          <div
            style={{
              fontSize: "13px",
              lineHeight: "1.5",
              maxHeight: "300px",
              overflow: "auto",
            }}
          >
            {detail.bodyText || detail.previewText}
          </div>
        </div>,
        { duration: 10000 },
      );
    },
    [contextWorkspace, t],
  );

  const harnessRequestMetadata = useWorkspaceHarnessRequestMetadataRuntime({
    enabled: workspaceHarnessEnabled && harnessRuntimeVisible,
    agentResponseLanguage,
    browserAssistAutoLaunch: browserAssistRequestAutoLaunch,
    browserAssistPreferredBackend: browserAssistRequestPreferredBackend,
    browserAssistProfileKey: browserAssistRequestProfileKey,
    contentId,
    currentGateKey: currentGate.key,
    effectiveChatToolPreferences,
    isThemeWorkbench,
    mappedTheme,
    preferredTeamPresetId,
    resolvedTeamMemoryShadowSnapshot,
    selectedTeam,
    selectedTeamLabel,
    selectedTeamSummary,
    themeWorkbenchActiveQueueTitle: themeWorkbenchActiveQueueItem?.title,
    workspaceSkillBindings: workspaceSkillBindingsRuntime.bindings,
    workspaceSkillRuntimeEnable: expertWorkspaceSkillRuntimeEnableInput,
  });
  const harnessInventoryRuntime = useWorkspaceHarnessInventoryRuntime({
    enabled: workspaceHarnessEnabled,
    chatMode,
    mappedTheme,
    harnessPanelVisible: harnessRuntimeVisible,
    harnessRequestMetadata,
    isThemeWorkbench,
    themeWorkbenchRunState,
    currentGate,
    themeWorkbenchBackendRunState,
    themeWorkbenchActiveQueueItem,
    harnessPendingCount,
  });

  useWorkspaceDocumentVersionStatusSyncRuntime({
    canvasState,
    isThemeWorkbench,
    setDocumentVersionStatusMap,
    themeWorkbenchLatestTerminal:
      themeWorkbenchBackendRunState?.latest_terminal ?? null,
    themeWorkbenchRunState,
  });

  const [taskCenterDraftSendRequest, setTaskCenterDraftSendRequest] =
    useState<TaskCenterDraftSendRequest | null>(null);
  const [homePendingPreviewRequest, setHomePendingPreviewRequest] =
    useState<TaskCenterDraftSendRequest | null>(null);

  // 会话文件持久化 hook
  const {
    saveFile: saveSessionFile,
    files: sessionFiles,
    readFile: readSessionFile,
    meta: sessionMeta,
  } = useSessionFiles({
    sessionId,
    theme: mappedTheme,
    creationMode,
    autoInit: shouldAutoInitWorkspaceSessionFiles({
      sessionId,
      isSending,
      currentTurnId,
      queuedTurnCount: queuedTurns.length,
      draftSendInFlight: Boolean(
        taskCenterDraftSendRequest || homePendingPreviewRequest,
      ),
    }),
  });

  const { syncGeneralArtifactToResource } = useWorkspaceGeneralResourceSync({
    activeTheme,
    projectId,
    sessionId,
    projectRootPath: project?.rootPath || null,
  });

  useWorkspaceCanvasContentSyncRuntime({
    canvasState,
    contentId,
    lastCanvasSyncRequestRef,
    syncContent,
  });

  const {
    bootstrapDispatchPreview,
    consumeInitialPrompt,
    consumedInitialPromptRef,
    dismissGeneralWorkbenchEntryPrompt,
    finalizeAfterSendSuccess,
    generalWorkbenchEntryCheckPending,
    generalWorkbenchEntryPrompt,
    hasTriggeredGuideRef,
    initialDispatchKey,
    isBootstrapDispatchPending,
    resetGuideState,
    resolveSendBoundary,
    rollbackAfterSendFailure,
  } = useGeneralWorkbenchInitialDispatchRuntime({
    activeTheme,
    autoRunInitialPromptOnMount,
    contentId,
    initialUserPrompt,
    initialUserImages,
    isSending,
    isThemeWorkbench,
    mappedTheme,
    messagesLength: messages.length,
    onInitialUserPromptConsumed,
    queuedTurnsLength: queuedTurns.length,
    sessionId,
    setInput,
    setSoulArtifactVoiceEnabledForTurn,
    shouldUseCompactGeneralWorkbench,
  });
  const { resetRestoredSessionState } = useWorkspaceSessionRestore({
    sessionId,
    sessionMeta,
    lockTheme,
    initialTheme,
    sessionFiles,
    taskFilesLength: taskFiles.length,
    setActiveTheme,
    setCreationMode,
    setTaskFiles,
  });
  const { handleBackHome, resetTopicLocalState } = useWorkspaceResetRuntime({
    clearMessages,
    clearRuntimeTeamState,
    clearPendingEntryA2UI: clearEntryPendingA2UI,
    clearProjectSelectionRuntime,
    resetProjectSelection,
    resetRestoredSessionState,
    resetGuideState,
    hasHandledNewChatRequest,
    markNewChatRequestHandled,
    defaultTopicSidebarVisible,
    normalizedInitialTheme: normalizedEntryTheme,
    initialCreationMode,
    newChatAt,
    externalProjectId,
    preserveSessionRestoreOnNewChat:
      shouldKeepNewTaskHomeSessionRestoreDisabled &&
      !shouldDisableSessionRestore,
    onNavigate: _onNavigate,
    autoCollapsedTopicSidebarRef,
    processedMessageIdsRef: processedMessageIds,
    setInput,
    setSelectedText,
    setLayoutMode,
    setShowSidebar,
    setCanvasState,
    setGeneralCanvasState,
    setTaskFiles,
    setSelectedFileId,
    setMentionedCharacters,
    setActiveTheme,
    setCreationMode,
  });
  const taskCenterDraftSurfaceActiveRef = useRef(false);
  const [taskCenterDraftTabs, setTaskCenterDraftTabs] = useState<
    TaskCenterDraftTab[]
  >([]);
  const [activeTaskCenterDraftTabId, setActiveTaskCenterDraftTabId] = useState<
    string | null
  >(null);
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

  const { switchTopic } = useWorkspaceTopicSwitch({
    projectId: validatedRuntimeProjectId,
    externalProjectId,
    originalSwitchTopic,
    onBeforeTopicSwitch: handleBeforeTopicSwitch,
    startTopicProjectResolution,
    finishTopicProjectResolution,
    deferTopicSwitch,
    consumePendingTopicSwitch,
    rememberProjectId,
    getRememberedProjectId,
    loadTopicBoundProjectId: (topicId) =>
      topicById.get(topicId)?.workspaceId ||
      loadPersistedSessionWorkspaceId(topicId) ||
      loadPersistedProjectId(`agent_session_workspace_${topicId}`),
    resetTopicLocalState,
  });
  const resolveInitialSessionSwitch = useCallback(
    (topicId: string) => {
      return resolveInitialTaskSessionSwitchOptions(topicById.get(topicId));
    },
    [topicById],
  );
  const initialSessionTopic = normalizedInitialSessionId
    ? (topicById.get(normalizedInitialSessionId) ?? null)
    : null;
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
    messages.length === 0 &&
    turns.length === 0 &&
    threadItems.length === 0 &&
    (!initialSessionTopic || (initialSessionTopic.messagesCount ?? 0) > 0);
  useWorkspaceInitialSessionNavigation({
    initialSessionId,
    currentSessionId: sessionId,
    resolveInitialSessionSwitch,
    shouldAllowResolvedForceMatchedHydration:
      !(agentEntry === "claw" || agentEntry === "new-task") ||
      (messages.length === 0 && turns.length === 0 && threadItems.length === 0),
    shouldPauseInitialSessionNavigation:
      shouldPauseInitialSessionNavigationForTaskCenterDraft,
    shouldHydrateMatchedInitialSession:
      isAutoRestoringSession ||
      isSessionHydrating ||
      shouldHydrateEmptyMatchedInitialSession,
    switchTopic,
  });
  const {
    clearTaskCenterEmbeddedHomeSession,
    isTaskCenterEntry,
    markTaskCenterEmbeddedHomeSession,
    markTaskCenterLocalSessionOverride,
    replaceTaskCenterOpenTabs,
    setTaskCenterDetachedTopicId,
    setTaskCenterLocalSessionOverride,
    setTaskCenterOpenTabMap,
    setTaskCenterTransitionTopicId,
    taskCenterDetachedTopicId,
    taskCenterEmbeddedHomeSessionIds,
    taskCenterFallbackRestoreRef,
    taskCenterLocalSessionOverride,
    taskCenterOpenTabIds,
    taskCenterOpenTabIdsRef,
    taskCenterTransitionTopicId,
    upsertTaskCenterOpenTab,
  } = useTaskCenterTabSessionRuntime({
    agentEntry,
    normalizedInitialSessionId,
    newChatAt,
    sessionId,
    taskCenterDraftSurfaceActiveRef,
    taskCenterWorkspaceId,
    topicById,
    topics,
    setActiveTaskCenterDraftTabId,
    setHomePendingPreviewRequest,
    setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs,
  });

  useTrayModelShortcuts({
    providerType,
    setProviderType,
    model,
    setModel,
    activeTheme: mappedTheme,
    autoSyncEnabled: false,
    deferInitialSync: true,
  });

  useWorkspaceCanvasMessageSyncRuntime({
    canvasState,
    isSpecializedThemeMode,
    isThemeWorkbench,
    mappedTheme,
    messages,
    processedMessageIdsRef: processedMessageIds,
    setCanvasState,
  });

  const submitImageWorkbenchAgentCommandRef = useRef<
    | ((params: SubmitImageWorkbenchAgentCommandParams) => Promise<boolean>)
    | null
  >(null);
  const imageWorkbenchActionRuntime = useWorkspaceImageWorkbenchActionRuntime({
    cancelImageTask: cancelMediaTaskArtifact,
    contentId,
    createImageGenerationTask: createImageGenerationTaskArtifact,
    getImageTask: getMediaTaskArtifact,
    currentImageWorkbenchState,
    imageWorkbenchPreferredModelId:
      effectiveImageWorkbenchPreference.preferredModelId,
    imageWorkbenchPreferredProviderId:
      effectiveImageWorkbenchPreference.preferredProviderId,
    imageWorkbenchPreferredProviderUnavailable:
      imageWorkbenchPreferredProviderUnavailable,
    imageWorkbenchSelectedModelId,
    imageWorkbenchSelectedProviderId,
    imageWorkbenchSelectedSize,
    imageWorkbenchSessionKey,
    ensureImageWorkbenchProvidersLoaded,
    imageWorkbenchProvidersLoading,
    projectId,
    projectRootPath: project?.rootPath || null,
    saveImageWorkbenchImagesToResource,
    submitImageWorkbenchAgentCommand: async (params) =>
      (await submitImageWorkbenchAgentCommandRef.current?.(params)) ?? false,
    setCanvasState,
    setInput,
    updateCurrentImageWorkbenchState,
  });
  const {
    handleImageWorkbenchCommand,
    resolveImageWorkbenchCommandRequest:
      _resolveImageWorkbenchActionCommandRequest,
  } = imageWorkbenchActionRuntime;
  const refreshImageWorkbenchSendRoute = useCallback(async () => {
    try {
      const latestMediaDefaults = await readGlobalMediaGenerationDefaults({
        forceRefresh: true,
      });
      setOnDemandMediaDefaults(latestMediaDefaults);
      const latestPreference = resolveMediaGenerationPreference(
        project?.settings?.imageGeneration,
        latestMediaDefaults.image,
      );
      imageWorkbenchSelectionRef.current =
        applyImagePreferenceToSendRouteSelection({
          preference: latestPreference,
          selection: imageWorkbenchSelectionRef.current,
        });
    } catch (error) {
      logAgentDebug(
        "AgentChatPage",
        "imageWorkbench.sendRoute.refresh.failed",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }, [project?.settings?.imageGeneration]);
  const prepareImageWorkbenchSkillSend = useCallback(async () => {
    await refreshImageWorkbenchSendRoute();
    const selectionBeforeProviderLoad = imageWorkbenchSelectionRef.current;
    await ensureImageWorkbenchProviderSelectionCommitted(
      selectionBeforeProviderLoad.requestProviderId &&
        selectionBeforeProviderLoad.requestModelId
        ? undefined
        : ensureImageWorkbenchProvidersLoaded,
      () => {
        const selection = imageWorkbenchSelectionRef.current;
        return Boolean(selection.requestProviderId && selection.requestModelId);
      },
    );

    const selection = imageWorkbenchSelectionRef.current;
    if (selection.preferredProviderUnavailable) {
      toast.error(t("agentChat.imageWorkbench.selection.preferredUnavailable"));
      return false;
    }
    if (selection.requestProviderId && selection.requestModelId) {
      return true;
    }
    if (selection.providersLoading) {
      toast.error(t("agentChat.imageWorkbench.selection.loading"));
      return false;
    }
    {
      toast.error(t("agentChat.imageWorkbench.selection.missing"));
      return false;
    }
  }, [ensureImageWorkbenchProvidersLoaded, refreshImageWorkbenchSendRoute, t]);
  const resolveImageWorkbenchSendCommandRequest = useCallback<
    typeof _resolveImageWorkbenchActionCommandRequest
  >(
    (params) =>
      resolveImageWorkbenchCommandRequestWithSelection({
        ...params,
        currentImageWorkbenchState,
        imageWorkbenchSelectedModelId:
          imageWorkbenchSelectionRef.current.requestModelId,
        imageWorkbenchSelectedProviderId:
          imageWorkbenchSelectionRef.current.requestProviderId,
        imageWorkbenchSelectedSize,
        imageWorkbenchSessionKey,
        projectId: params.projectId ?? projectId,
        projectRootPath: params.projectRootPath ?? project?.rootPath ?? null,
        contentId,
        requireProjectContext: params.applyTarget != null,
      }),
    [
      contentId,
      currentImageWorkbenchState,
      imageWorkbenchSelectedSize,
      imageWorkbenchSessionKey,
      project?.rootPath,
      projectId,
    ],
  );
  const {
    handleSend,
    handleRecommendationClick,
    handleSendRef,
    isPreparingSend,
    displayMessages,
    teamDispatchPreviewState,
  } = useWorkspaceSendActions({
    input,
    setInput,
    mentionedCharacters,
    setMentionedCharacters,
    chatToolPreferences: effectiveChatToolPreferences,
    setChatToolPreferences,
    serviceSkills: activeTheme === "general" ? serviceSkills : [],
    activeTheme,
    mappedTheme,
    isThemeWorkbench,
    contextWorkspace: {
      enabled: contextWorkspace.generalWorkbenchEnabled,
      activeContextPrompt: contextWorkspace.activeContextPrompt,
      prepareActiveContextPrompt: contextWorkspace.prepareActiveContextPrompt,
    },
    projectId,
    projectRootPath: project?.rootPath || null,
    sessionId,
    executionStrategy,
    accessMode,
    providerType,
    preferredTeamPresetId,
    selectedTeam,
    selectedTeamLabel,
    selectedTeamSummary,
    teamMemoryShadowSnapshot: resolvedTeamMemoryShadowSnapshot,
    workspaceSkillBindings: workspaceSkillBindingsRuntime.bindings,
    workspaceSkillRuntimeEnable: expertWorkspaceSkillRuntimeEnableInput,
    currentGateKey: currentGate.key,
    themeWorkbenchActiveQueueTitle: themeWorkbenchActiveQueueItem?.title,
    contentId,
    browserAssistProfileKey: browserAssistRequestProfileKey,
    browserAssistPreferredBackend: browserAssistRequestPreferredBackend,
    browserAssistAutoLaunch: browserAssistRequestAutoLaunch,
    browserAssistSessionState,
    workspaceRequestMetadataBase:
      workspaceRequestMetadataWithExpertSkills ?? undefined,
    savedSoulArtifactVoiceGenerationBrief: soulArtifactVoiceGenerationBrief,
    soulArtifactVoiceEnabledForTurn,
    soulCopy: soulInteractionCopy,
    serviceModels,
    agentResponseLanguage,
    resolveServiceModelsBeforeSend: shouldDeferWorkspaceAuxiliaryLoads
      ? refreshServiceModelsConfig
      : undefined,
    messages,
    setChatMessages,
    bootstrapDispatchPreview,
    sendMessage,
    resolveSendBoundary,
    finalizeAfterSendSuccess,
    rollbackAfterSendFailure,
    prepareRuntimeTeamBeforeSend,
    ensureBrowserAssistCanvas,
    handleAutoLaunchMatchedSiteSkill:
      workspaceServiceSkillEntryActions.handleAutoLaunchMatchedSiteSkill,
    openRuntimeSceneGate,
    ensureSessionForCommandMetadata: ensureSession,
    prepareImageWorkbenchSkillSend,
    resolveImageWorkbenchCommandRequest:
      resolveImageWorkbenchSendCommandRequest,
  });
  useEffect(() => {
    sceneGateResumeHandlerRef.current = async ({ rawText, requestMetadata }) =>
      await handleSendRef.current(
        [],
        undefined,
        undefined,
        rawText,
        undefined,
        undefined,
        {
          requestMetadata,
          skipSceneCommandRouting: true,
        },
      );
  }, [handleSendRef]);
  const submitImageWorkbenchAgentCommand = useCallback(
    async (params: SubmitImageWorkbenchAgentCommandParams) =>
      await handleSendRef.current(
        params.images,
        undefined,
        undefined,
        params.rawText,
        undefined,
        undefined,
        {
          displayContent: params.displayContent,
          requestMetadata: buildImageCommandIntentRequestMetadata(
            undefined,
            params.requestContext,
          ),
        },
      ),
    [handleSendRef],
  );
  submitImageWorkbenchAgentCommandRef.current =
    submitImageWorkbenchAgentCommand;

  const handleContinueGeneralWorkbenchEntryPrompt = useCallback(async () => {
    if (!generalWorkbenchEntryPrompt) {
      return;
    }

    const promptToSend =
      input.trim() || generalWorkbenchEntryPrompt.prompt.trim();
    if (!promptToSend) {
      toast.info("请先补充要继续执行的内容");
      return;
    }

    await handleSendRef.current([], undefined, undefined, promptToSend);
  }, [generalWorkbenchEntryPrompt, handleSendRef, input]);
  const applyWorkbenchFollowUpActionPayload = useCallback(
    (payload: GeneralWorkbenchFollowUpActionPayload) => {
      const normalizedPrompt = payload.prompt.trim();
      if (!normalizedPrompt) {
        return;
      }
      const nextBannerMessage = payload.bannerMessage?.trim() || null;
      setRuntimeEntryBannerMessage(nextBannerMessage);
      setEntryBannerVisible(Boolean(nextBannerMessage || entryBannerMessage));
      setInput(normalizedPrompt);
      const nextRuntimeInitialInputCapability =
        buildRuntimeInitialInputCapabilityFromFollowUpAction({
          payload,
          requestKey: Date.now(),
        });
      if (!nextRuntimeInitialInputCapability) {
        return;
      }
      setRuntimeInitialInputCapability(nextRuntimeInitialInputCapability);
    },
    [entryBannerMessage],
  );
  const handleRestartGeneralWorkbenchEntryPrompt = useCallback(() => {
    if (!generalWorkbenchEntryPrompt) {
      return;
    }

    dismissGeneralWorkbenchEntryPrompt({
      consumeInitialPrompt:
        generalWorkbenchEntryPrompt.kind === "initial_prompt",
      onConsumeInitialPrompt: () => {
        consumeInitialPrompt(initialDispatchKey);
      },
    });
    setInput("");
  }, [
    consumeInitialPrompt,
    dismissGeneralWorkbenchEntryPrompt,
    generalWorkbenchEntryPrompt,
    initialDispatchKey,
    setInput,
  ]);
  const {
    handleDocumentAutoContinueRun,
    handleArtifactBlockRewriteRun,
    handleDocumentContentReviewRun,
    handleDocumentTextStylizeRun,
    handleSwitchBranchVersion,
    handleCreateVersionSnapshot,
    handleSetBranchStatus,
    handleAddImage,
    handleImportDocument,
  } = useWorkspaceCanvasWorkflowActions({
    sendRef: handleSendRef,
    setCanvasState,
    setTopicStatus,
    projectId,
    projectName: project?.name,
    canvasState,
    contentId,
    selectedText,
    onRunImageWorkbenchCommand: handleImageWorkbenchCommand,
  });
  const { handleInputbarA2UISubmit } = useWorkspaceA2UISubmitActions({
    handlePermissionResponse,
    pendingPromotedA2UIActionRequest,
    resolvePendingA2UISubmit,
    sendMessage,
  });
  const handlePendingA2UISubmit = useCallback(
    (formData: Parameters<typeof handleInputbarA2UISubmit>[0]) => {
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
      handleSceneGateSubmit,
      handlePendingServiceSkillLaunchSubmit,
      pendingSceneGateForm,
      pendingServiceSkillLaunchForm,
    ],
  );
  const handleMessageA2UISubmit = useCallback(
    (
      formData: Parameters<typeof handleInputbarA2UISubmit>[0],
      _messageId: string,
    ) => {
      handleInputbarA2UISubmit(formData);
    },
    [handleInputbarA2UISubmit],
  );

  // 监听工作区技能触发
  useEffect(() => {
    if (!pendingSkillKey || !isThemeWorkbench) {
      return;
    }

    // 立即消费，避免重复触发
    consumePendingSkill();

    // 触发技能命令
    const command = `/${pendingSkillKey}`;
    console.log("[AgentChatPage] 执行技能命令:", command);
    handleSend([], false, false, command);
  }, [pendingSkillKey, isThemeWorkbench, consumePendingSkill, handleSend]);
  const latestAssistantMessageId = useMemo(
    () =>
      [...displayMessages]
        .reverse()
        .find((message) => message.role === "assistant")?.id ?? null,
    [displayMessages],
  );
  const taskCenterDraftSurfaceActive = taskCenterDraftSurfaceActiveRef.current;
  const {
    isTaskCenterDraftTabActive,
    isTaskCenterDraftSurfaceActive,
    shouldSuppressTaskCenterDraftContent,
  } = resolveTaskCenterDraftSurfaceState({
    agentEntry,
    isTaskCenterEntry,
    activeDraftTabId: activeTaskCenterDraftTabId,
    draftTabs: taskCenterDraftTabs,
    draftSurfaceActive: taskCenterDraftSurfaceActive,
    draftSendRequest: taskCenterDraftSendRequest,
    displayMessageCount: displayMessages.length,
    threadItemCount: effectiveThreadItems.length,
    hasLocalSessionOverride: taskCenterLocalSessionOverride !== null,
    hasPendingA2UIForm,
    isPreparingSend,
    isSending,
    queuedTurnCount: queuedTurns.length,
  });
  const { homePendingPreviewMessages, isHomePendingPreviewActive } =
    useTaskCenterHomePendingPreviewRuntime({
      homePendingPreviewRequest,
      displayMessagesLength: displayMessages.length,
      executionStrategy,
      workspaceId: taskCenterWorkspaceId,
      soulCopy: soulInteractionCopy,
    });
  const bootstrapPendingPreviewMessages = useMemo(
    () =>
      bootstrapDispatchPreview && displayMessages.length === 0
        ? buildInitialDispatchPreviewMessages(bootstrapDispatchPreview)
        : [],
    [bootstrapDispatchPreview, displayMessages.length],
  );
  const persistTaskCenterMaterializedSessionNavigation = useCallback(
    (sessionId: string) => {
      const normalizedSessionId = sessionId.trim();
      if (!_onNavigate || !normalizedSessionId) {
        return;
      }

      _onNavigate(
        "agent",
        buildClawAgentParams({
          ...(taskCenterWorkspaceId
            ? { projectId: taskCenterWorkspaceId }
            : {}),
          initialSessionId: normalizedSessionId,
          theme: activeTheme,
          lockTheme,
        }),
      );
    },
    [_onNavigate, activeTheme, lockTheme, taskCenterWorkspaceId],
  );

  const hasCanvasWorkbenchContent = layoutMode !== "chat";
  const {
    hasDisplayMessages,
    hasMessages,
    effectiveShowChatPanel,
    shouldRestoreImageTasksFromWorkspace,
  } = resolveAgentChatWorkspaceShellViewModel({
    agentEntry,
    showChatPanel,
    contentId,
    initialSessionId,
    displayMessageCount: displayMessages.length,
    threadItemCount: effectiveThreadItems.length,
    isHomePendingPreviewActive,
    shouldSuppressTaskCenterDraftContent,
    hasCanvasWorkbenchContent,
    isThemeWorkbench,
    shouldUseCompactGeneralWorkbench,
    isBootstrapDispatchPending,
    isSending,
    queuedTurnCount: queuedTurns.length,
  });
  const handleCanvasSelectionTextChange = useCallback((text: string) => {
    const normalized = text.trim().replace(/\s+/g, " ");
    const nextValue =
      normalized.length > 500 ? normalized.slice(0, 500) : normalized;
    startTransition(() => {
      setSelectedText((previous) =>
        previous === nextValue ? previous : nextValue,
      );
    });
  }, []);

  useEffect(() => {
    setSelectedText("");
  }, [activeTheme, contentId]);

  const { handleToggleCanvas, handleCloseCanvas, resolvedCanvasState } =
    useWorkspaceCanvasLayoutRuntime({
      activeTheme,
      isThemeWorkbench,
      hasPendingA2UIForm,
      layoutMode,
      showChatPanel: effectiveShowChatPanel,
      showSidebar,
      defaultTopicSidebarVisible,
      hasMessages,
      canvasWorkbenchLayoutMode,
      autoCollapsedTopicSidebarRef,
      mappedTheme,
      normalizedEntryTheme,
      shouldPreserveBlankHomeSurface,
      shouldBootstrapCanvasOnEntry,
      canvasState,
      generalCanvasState,
      hasCurrentCanvasArtifact: Boolean(currentCanvasArtifact),
      currentCanvasArtifactType: currentCanvasArtifact?.type,
      hasBrowserAssistArtifact,
      currentImageWorkbenchActive: currentImageWorkbenchState.active,
      onHasMessagesChange,
      suppressGeneralCanvasArtifactAutoOpen,
      suppressBrowserAssistCanvasAutoOpen,
      clearBrowserAssistCanvasArtifact,
      setShowSidebar,
      setLayoutMode,
      setGeneralCanvasState,
      setCanvasState,
      setCanvasWorkbenchLayoutMode,
    });

  useWorkspaceCanvasTaskFileSync({
    taskFiles,
    isThemeWorkbench,
    selectedFileId,
    canvasState,
    mappedTheme,
    documentEditorFocusedRef,
    setSelectedFileId,
    setCanvasState,
  });

  const {
    activeTaskCenterDraftTabIdRef,
    commitMaterializedTaskCenterDraftTab,
    materializeTaskCenterDraftTab,
    openTaskCenterDraftTab,
    taskCenterDraftMaterializedSessionIdsRef,
    taskCenterDraftWarmupSessionIdsRef,
    taskCenterDraftTabsRef,
  } = useTaskCenterDraftMaterializationRuntime({
    activeTaskCenterDraftTabId,
    agentEntry,
    clearMessages,
    createFreshSession,
    input,
    isPreparingSend,
    isSending,
    markTaskCenterEmbeddedHomeSession,
    markTaskCenterLocalSessionOverride,
    resetLocalImageWorkbenchSessionScope,
    resetTopicLocalState,
    setActiveTaskCenterDraftTabId,
    setHomePendingPreviewRequest,
    setInput,
    setMentionedCharacters,
    setSelectedText,
    setTaskCenterDetachedTopicId,
    setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs,
    setTaskCenterTransitionTopicId,
    persistMaterializedSessionNavigation:
      persistTaskCenterMaterializedSessionNavigation,
    switchMaterializedSession: switchTopic,
    taskCenterDraftSurfaceActiveRef,
    taskCenterDraftTabs,
    taskCenterWorkspaceId,
    upsertTaskCenterOpenTab,
  });
  const {
    handleCloseTaskCenterTab,
    handleOpenTaskTopic,
    handleSwitchTaskTopic,
  } = useTaskCenterTopicNavigationRuntime({
    activeSessionIdRef,
    activeTaskCenterDraftTabIdRef,
    agentEntry,
    clearEntryPendingA2UI,
    clearMessages,
    clearTaskCenterEmbeddedHomeSession,
    messagesLength: messages.length,
    openTaskCenterDraftTab,
    replaceTaskCenterOpenTabs,
    resetLocalImageWorkbenchSessionScope,
    resetTopicLocalState,
    sessionId,
    setActiveTaskCenterDraftTabId,
    setHomePendingPreviewRequest,
    setInput,
    setMentionedCharacters,
    setSelectedText,
    setTaskCenterDetachedTopicId,
    setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs,
    setTaskCenterLocalSessionOverride,
    setTaskCenterOpenTabMap,
    setTaskCenterTransitionTopicId,
    switchTopic,
    taskCenterDetachedTopicId,
    taskCenterDraftSurfaceActiveRef,
    taskCenterDraftTabsRef,
    taskCenterOpenTabIdsRef,
    taskCenterTransitionTopicId,
    taskCenterWorkspaceId,
    topicById,
    upsertTaskCenterOpenTab,
    markTaskCenterLocalSessionOverride,
  });

  const {
    browserWorkspaceHomeTabsNode,
    handleOpenProjectConversation,
    handleResumeRecentSession,
    hasHomeConversationActivity,
    isTaskCenterDraftSendPending,
    projectConversationGroups,
    recentSessionActionLabel,
    recentSessionTopic,
    shouldRenderTaskCenterEmbeddedHome,
    shouldRenderTaskCenterTabStrip,
    suppressHomeNavbarUtilityActions,
    taskCenterHomeSurfaceState,
    taskCenterTabsNode,
  } = useTaskCenterChromeNavigationRuntime({
    activeDraftTabId: activeTaskCenterDraftTabId,
    agentEntry,
    applyProjectSelection,
    clearEmbeddedHomeSession: clearTaskCenterEmbeddedHomeSession,
    detachedTopicId: taskCenterDetachedTopicId,
    displayMessageCount: displayMessages.length,
    draftSendRequest: taskCenterDraftSendRequest,
    draftSurfaceActive: taskCenterDraftSurfaceActiveRef.current,
    draftTabActive: isTaskCenterDraftTabActive,
    draftTabs: taskCenterDraftTabs,
    embeddedHomeSessionIds: taskCenterEmbeddedHomeSessionIds,
    externalProjectId,
    fallbackRestoreRef: taskCenterFallbackRestoreRef,
    hasDisplayMessages,
    hasLocalSessionOverride: taskCenterLocalSessionOverride !== null,
    hasPendingA2UIForm,
    harnessPanelVisible,
    homeMountedAt: workspaceRenderT0.current,
    initialDispatchKey,
    initialPendingServiceSkillLaunchSignature,
    isAutoRestoringSession,
    isBootstrapDispatchPending,
    isHomeSessionBackgroundRecovery:
      sessionRestorePresentation === "background" &&
      !normalizedInitialSessionId,
    isHomePendingPreviewActive,
    isPreparingSend,
    isSending,
    isSessionHydrating,
    isTaskCenterDraftSurfaceActive,
    isTaskCenterDraftTabActive,
    isThemeWorkbench,
    layoutMode,
    messagesLength: messages.length,
    newChatAt,
    newConversationLabel,
    normalizedInitialSessionId,
    onCloseTaskCenterTab: handleCloseTaskCenterTab,
    onNavigate: _onNavigate,
    onOpenTaskTopic: handleOpenTaskTopic,
    onSwitchTaskTopic: handleSwitchTaskTopic,
    onToggleWorkbench: handleToggleCanvas,
    openDraftTab: openTaskCenterDraftTab,
    openTabIds: taskCenterOpenTabIds,
    openedProjects,
    projectId,
    queuedTurnsLength: queuedTurns.length,
    renamePromptLabel: taskCenterRenamePromptLabel,
    renameTopic,
    resetProjectSelection,
    sessionId,
    setHarnessPanelVisible,
    shouldSuppressDraftContent: shouldSuppressTaskCenterDraftContent,
    shouldUseBrowserWorkspaceHomeChrome,
    taskCenterWorkspaceId,
    threadItemCount: effectiveThreadItems.length,
    topicById,
    topics,
    transitionTopicId: taskCenterTransitionTopicId,
    untitledTaskLabel,
  });
  const handleWriteFile = useWorkspaceWriteFileAction({
    activeTheme,
    artifacts,
    contentId,
    currentGateKey: currentGate.key,
    isThemeWorkbench,
    mappedTheme,
    projectId,
    sessionId,
    themeWorkbenchActiveQueueItem,
    taskFilesRef,
    socialStageLogRef,
    setDocumentVersionStatusMap,
    saveSessionFile: async (fileName, content, metadata) => {
      await saveSessionFile(fileName, content, metadata);
    },
    syncGeneralArtifactToResource,
    upsertGeneralArtifact,
    setSelectedArtifactId,
    setArtifactViewMode: applyAutoArtifactViewMode,
    setLayoutMode,
    suppressCanvasAutoOpen: suppressCanvasAutoOpenForPendingA2UI,
    setTaskFiles,
    setSelectedFileId,
    setCanvasState,
  });

  // 更新 ref，供统一聊天主链 Hook 使用
  useEffect(() => {
    handleWriteFileRef.current = handleWriteFile;
  }, [handleWriteFile]);

  const handleSaveArtifactDocument = useCallback(
    async (artifact: Artifact, document: ArtifactDocumentV1) => {
      const filePath = resolveArtifactProtocolFilePath(artifact);
      const serializedDocument = JSON.stringify(document, null, 2);

      await Promise.resolve(
        handleWriteFile(serializedDocument, filePath, {
          artifactId: artifact.id,
          source: "message_content",
          status: "complete",
          artifact: {
            ...artifact,
            content: serializedDocument,
            status: "complete",
            meta: {
              ...artifact.meta,
              artifactDocument: document,
              language: "json",
              filePath:
                typeof artifact.meta.filePath === "string" &&
                artifact.meta.filePath.trim()
                  ? artifact.meta.filePath
                  : filePath,
              filename:
                typeof artifact.meta.filename === "string" &&
                artifact.meta.filename.trim()
                  ? artifact.meta.filename
                  : artifact.title,
            },
            updatedAt: Date.now(),
          },
          metadata: {
            writePhase: "persisted",
            previewText: document.summary || document.title,
            lastUpdateSource: "message_content",
          },
        }),
      );
      const saveResult = await saveAgentRuntimeArtifactDocumentSnapshot(
        artifact,
        document,
      );
      if (saveResult.status === "appended") {
        await Promise.resolve(
          handleWriteFile(
            serializedDocument,
            filePath,
            buildArtifactDocumentSaveEvidenceWriteContext({
              artifact,
              document,
              evidence: saveResult.evidence,
              serializedDocument,
            }),
          ),
        );
      }
    },
    [handleWriteFile],
  );
  const { renderToolbarActions: renderBaseArtifactWorkbenchToolbarActions } =
    useWorkspaceArtifactWorkbenchActions({
      activeTheme,
      projectId,
      syncGeneralArtifactToResource,
      onSaveArtifactDocument: handleSaveArtifactDocument,
    });

  const {
    handleHarnessLoadFilePreview,
    openArtifactInWorkbench: openWorkspaceArtifactInWorkbench,
    handleArtifactClick,
    handleFileClick,
    handleCodeBlockClick,
    shouldCollapseCodeBlocks,
    shouldCollapseCodeBlockInChat,
    handleTaskFileClick,
  } = useWorkspaceArtifactPreviewActions({
    activeTheme,
    mappedTheme,
    layoutMode,
    isThemeWorkbench,
    isGeneralCanvasOpen: generalCanvasState.isOpen,
    artifacts,
    currentCanvasArtifact,
    taskFiles,
    sessionFiles,
    readSessionFile,
    suppressBrowserAssistCanvasAutoOpen,
    onOpenBrowserRuntimeForArtifact: handleOpenBrowserRuntimeForBrowserAssist,
    onRequestCanvasPreviewOpen:
      workbenchRequests.requestCanvasWorkbenchPreviewOpen,
    upsertGeneralArtifact,
    setSelectedArtifactId,
    setArtifactViewMode: applyAutoArtifactViewMode,
    setLayoutMode,
    setTaskFiles,
    setSelectedFileId,
    setGeneralCanvasState,
    setCanvasState,
  });
  const handleWorkspaceFileClick = useCallback(
    (fileName: string, content: string) => {
      workbenchRequests.clearFocusedArtifactBlock();
      const normalizedFileName = fileName.trim();
      if (content.trim() || !normalizedFileName) {
        handleFileClick(fileName, content);
        return;
      }

      void (async () => {
        const absolutePath =
          resolveAbsoluteWorkspacePath(project?.rootPath, normalizedFileName) ||
          normalizedFileName;
        const preview = await handleHarnessLoadFilePreview(absolutePath);
        if (preview.error) {
          toast.error(
            t("agentChat.filePreview.openFailed", {
              message: preview.error,
            }),
          );
          return;
        }
        const nextContent =
          !preview.isBinary && typeof preview.content === "string"
            ? preview.content
            : "";
        const nextFilePath = isAbsoluteWorkspacePath(normalizedFileName)
          ? preview.path || normalizedFileName
          : normalizedFileName;
        startTransition(() => {
          if (activeTheme === "general") {
            setGeneralCanvasState(
              buildGeneralCanvasStateFromWorkspaceFile(
                nextFilePath,
                nextContent,
                { sourcePath: preview.path || absolutePath },
              ),
            );
            openCanvasForReason("user_open_file", setLayoutMode);
            return;
          }

          handleFileClick(nextFilePath, nextContent);
        });
      })();
    },
    [
      activeTheme,
      handleFileClick,
      handleHarnessLoadFilePreview,
      project?.rootPath,
      setLayoutMode,
      t,
      workbenchRequests,
    ],
  );
  const openProjectFilePreviewInCanvas = useCallback(
    async ({
      relativePath,
      absolutePath,
      isCancelled,
    }: {
      relativePath?: string | null;
      absolutePath: string;
      isCancelled?: () => boolean;
    }) => {
      const preview = await handleHarnessLoadFilePreview(absolutePath);
      if (isCancelled?.()) {
        return false;
      }

      if (preview.error) {
        toast.error(`打开导出文件失败: ${preview.error}`);
        return false;
      }

      const nextContent =
        !preview.isBinary && typeof preview.content === "string"
          ? preview.content
          : "";
      const nextFilePath = relativePath?.trim() || preview.path || absolutePath;
      startTransition(() => {
        if (activeTheme === "general") {
          setGeneralCanvasState(
            buildGeneralCanvasStateFromWorkspaceFile(
              nextFilePath,
              nextContent,
              { sourcePath: preview.path || absolutePath },
            ),
          );
          openCanvasForReason("user_open_file", setLayoutMode);
          return;
        }

        handleWorkspaceFileClick(nextFilePath, nextContent);
      });
      return true;
    },
    [
      activeTheme,
      handleHarnessLoadFilePreview,
      handleWorkspaceFileClick,
      setLayoutMode,
    ],
  );
  const handleOpenSavedSiteContent = useCallback(
    async ({
      projectId: targetProjectId,
      contentId: targetContentId,
      preferredTarget,
      projectFile,
    }: SiteSavedContentTarget) => {
      const relativePath = projectFile?.relativePath?.trim() || "";
      const canOpenInlineInCurrentWorkspace =
        preferredTarget === "project_file" &&
        Boolean(relativePath) &&
        Boolean(project?.rootPath) &&
        Boolean(projectId) &&
        targetProjectId === projectId;

      if (canOpenInlineInCurrentWorkspace) {
        const absolutePath = resolveAbsoluteWorkspacePath(
          project?.rootPath,
          relativePath,
        );
        if (absolutePath) {
          const opened = await openProjectFilePreviewInCanvas({
            relativePath,
            absolutePath,
          });
          if (opened) {
            return;
          }
        }
      }

      _onNavigate?.("agent", {
        projectId: targetProjectId,
        contentId: targetContentId,
        lockTheme: true,
        fromResources: true,
        ...(preferredTarget === "project_file" && relativePath
          ? {
              initialProjectFileOpenTarget: {
                relativePath,
                requestKey: Date.now(),
              },
            }
          : {}),
      });
    },
    [_onNavigate, openProjectFilePreviewInCanvas, project?.rootPath, projectId],
  );
  const {
    bindArticleEditorRightSurface,
    bindRightSurfacePendingActions,
    handleWorkspaceArtifactClick,
  } = useWorkspaceRightSurfaceArtifactOpenRuntime({
    clearFocusedArtifactBlock: workbenchRequests.clearFocusedArtifactBlock,
    fallbackOpenArtifact: handleArtifactClick,
    openArticleWorkspaceRightSurface,
    setExpertInfoPanelCollapsed,
    setHarnessPanelVisible,
  });
  const handleOpenWorkspacePluginHistoryArtifactPreview = useCallback(
    (item: WorkspacePluginHistoryRestoreArtifactPreviewItem) => {
      const artifact =
        buildWorkspacePluginHistoryRestoreArtifactPreviewArtifact({
          projection: workspacePluginHistoryRestoreProjection,
          item,
          title: String(
            t(
              "agentChat.workspaceConversation.pluginHistory.previewArtifactTitle",
              {
                index: item.displayIndex,
              },
            ),
          ),
        });
      if (!artifact) {
        toast.error(
          String(
            t(
              "agentChat.workspaceConversation.pluginHistory.previewUnavailable",
            ),
          ),
        );
        return;
      }

      upsertGeneralArtifact(artifact);
      handleWorkspaceArtifactClick(artifact);
    },
    [
      handleWorkspaceArtifactClick,
      t,
      upsertGeneralArtifact,
      workspacePluginHistoryRestoreProjection,
    ],
  );
  const workspacePluginHistoryRestoreLandingCard =
    workspacePluginHistoryRestoreLandingModel ? (
      <WorkspacePluginHistoryRestoreLandingCard
        artifactPreviewItems={workspacePluginHistoryRestoreArtifactPreviewItems}
        model={workspacePluginHistoryRestoreLandingModel}
        onOpenArtifactPreview={handleOpenWorkspacePluginHistoryArtifactPreview}
      />
    ) : null;
  const openMessageAttachmentPreview = useCallback(
    (
      target: Extract<MessagePreviewTarget, { kind: "message_attachment" }>,
      message: Message,
    ) => {
      const attachment = target.attachment;
      const sourceRef =
        attachment.sourcePath?.trim() ||
        attachment.sourceUri?.trim() ||
        `${message.id}:attachment:${target.index}`;
      const sourceUri = attachment.sourceUri?.trim();
      const canUseSourceUriAsPreview =
        Boolean(sourceUri) &&
        (/^(data|https?|file|asset):/u.test(sourceUri || "") ||
          sourceUri?.startsWith("//"));
      const previewUrl =
        attachment.previewUrl?.trim() ||
        (canUseSourceUriAsPreview ? sourceUri : undefined) ||
        (attachment.data.trim()
          ? `data:${attachment.mediaType || "image/png"};base64,${attachment.data.trim()}`
          : undefined);
      const sourcePath = attachment.sourcePath?.trim() || sourceRef;
      const projection = createPreviewArtifact({
        source: "session_file",
        sourceRef,
        path: sourcePath,
        title: `attachment-${target.index + 1}`,
        content: "",
        isBinary: true,
        mimeType: attachment.mediaType,
        previewUrl,
        meta: {
          openedFrom: "message-attachment",
          messageId: message.id,
          attachmentIndex: target.index,
        },
      });
      upsertGeneralArtifact(projection.artifact);
      handleWorkspaceArtifactClick(projection.artifact);
      workbenchRequests.requestCanvasWorkbenchPreviewOpen({
        filePath: sourcePath,
        selectionKey: `artifact:${projection.artifact.id}`,
      });
    },
    [handleWorkspaceArtifactClick, workbenchRequests, upsertGeneralArtifact],
  );
  const { openMediaReferencePreview, openMediaReferencePreviewPage } =
    useWorkspaceMediaReferencePreviewRuntime({
      artifacts,
      handleWorkspaceArtifactClick,
      requestCanvasWorkbenchPreviewOpen:
        workbenchRequests.requestCanvasWorkbenchPreviewOpen,
      sessionId,
      setCanvasWorkbenchLayoutMode,
      setLayoutMode,
      t,
      upsertGeneralArtifact,
    });
  const renderMediaReferencePaginationActions = useCallback(
    (artifact: Artifact) => {
      const pageRequest = resolveMediaReferencePreviewPageRequest(
        artifact,
        messages,
      );
      if (!pageRequest) {
        return null;
      }

      return (
        <MediaReferencePreviewPaginationActions
          artifact={artifact}
          onOpenPage={(page) => {
            void openMediaReferencePreviewPage(
              pageRequest.target,
              pageRequest.message,
              page,
            );
          }}
        />
      );
    },
    [messages, openMediaReferencePreviewPage],
  );
  const renderArtifactWorkbenchToolbarActions = useCallback(
    (params: { artifact: Artifact; document: ArtifactDocumentV1 | null }) => {
      const baseActions = renderBaseArtifactWorkbenchToolbarActions(params);
      const paginationActions = renderMediaReferencePaginationActions(
        params.artifact,
      );
      if (!baseActions && !paginationActions) {
        return null;
      }
      return (
        <>
          {baseActions}
          {paginationActions}
        </>
      );
    },
    [
      renderBaseArtifactWorkbenchToolbarActions,
      renderMediaReferencePaginationActions,
    ],
  );
  const handleOpenUrlPreview = useCallback(
    (item: SearchResultPreviewItem) => {
      const url = item.url.trim();
      if (!url) {
        return;
      }
      if (layoutMode === "chat") {
        handleToggleCanvas();
      } else if (layoutMode === "canvas") {
        setLayoutMode("chat-canvas");
      }
      setCanvasWorkbenchLayoutMode("split");
      workbenchRequests.requestBrowserWorkbenchOpen(url);
    },
    [
      handleToggleCanvas,
      layoutMode,
      setCanvasWorkbenchLayoutMode,
      setLayoutMode,
      workbenchRequests,
    ],
  );
  const handleOpenMessagePreview = useCallback(
    (target: MessagePreviewTarget, message: Message) => {
      if (target.kind === "image_workbench") {
        updateCurrentImageWorkbenchState((current) =>
          resolveImageWorkbenchStateForPreviewSelection({
            current,
            messages,
            preview: target.preview,
            selection: target.selection,
          }),
        );
        openCanvasForReason("user_open_message_preview", setLayoutMode);
        return;
      }

      if (target.kind === "message_attachment") {
        openMessageAttachmentPreview(target, message);
        return;
      }

      if (target.kind === "media_reference") {
        void openMediaReferencePreview(target, message);
        return;
      }

      if (target.preview.kind === "video_generate") {
        const preview = target.preview;
        const initialState = createInitialVideoState(preview.prompt);
        setCanvasState({
          ...initialState,
          providerId: preview.providerId?.trim() || "",
          model: preview.model?.trim() || "",
          duration: preview.durationSeconds || initialState.duration,
          aspectRatio: normalizeVideoAspectRatio(preview.aspectRatio),
          resolution: normalizeVideoResolution(preview.resolution),
          status: resolveVideoCanvasStatusFromPreview(target),
          selectedTaskId: preview.taskId,
          videoUrl: preview.videoUrl || undefined,
          errorMessage:
            preview.status === "failed" || preview.status === "cancelled"
              ? preview.statusMessage?.trim() || "视频任务未成功完成"
              : undefined,
        });
        openCanvasForReason("user_open_message_preview", setLayoutMode);
        return;
      }

      const matchedArtifact = resolveTaskPreviewArtifact(message, target);
      if (matchedArtifact) {
        handleWorkspaceArtifactClick(matchedArtifact);
        return;
      }

      const normalizedArtifactPath = normalizeArtifactProtocolPath(
        target.preview.artifactPath || null,
      );
      if (normalizedArtifactPath) {
        const matchedTaskFile = taskFiles.find((file) =>
          doesWorkspaceFileCandidateMatch(file.name, normalizedArtifactPath),
        );
        if (matchedTaskFile?.content?.trim()) {
          handleWorkspaceFileClick(
            matchedTaskFile.name,
            matchedTaskFile.content,
          );
          return;
        }
      }

      toast.info("当前任务产物还未同步完成，请稍后再试");
    },
    [
      handleWorkspaceArtifactClick,
      handleWorkspaceFileClick,
      openMessageAttachmentPreview,
      openMediaReferencePreview,
      messages,
      setCanvasState,
      setLayoutMode,
      taskFiles,
      updateCurrentImageWorkbenchState,
    ],
  );
  const handleOpenArtifactFromTimeline = useCallback(
    (target: ArtifactTimelineOpenTarget) => {
      void (async () => {
        let content = target.content;
        if (!content.trim()) {
          const absolutePath = resolveAbsoluteWorkspacePath(
            project?.rootPath,
            target.filePath,
          );
          if (absolutePath) {
            const preview = await handleHarnessLoadFilePreview(absolutePath);
            if (preview.error) {
              toast.error(`打开产物失败: ${preview.error}`);
              return;
            }
            if (preview.isBinary) {
              toast.info("该产物是二进制格式，暂不支持在工作台预览");
              return;
            }
            content =
              typeof preview.content === "string" ? preview.content : "";
          }
        }

        handleWorkspaceFileClick(target.filePath, content);

        if (target.openMode === "file_preview") {
          workbenchRequests.requestCanvasWorkbenchPreviewOpen({
            filePath: target.filePath,
          });
        }

        const normalizedBlockId = target.blockId?.trim();
        if (!normalizedBlockId) {
          return;
        }

        workbenchRequests.focusArtifactBlock(normalizedBlockId);
      })();
    },
    [
      handleHarnessLoadFilePreview,
      handleWorkspaceFileClick,
      project?.rootPath,
      workbenchRequests,
    ],
  );
  const siteSkillSavedContentTarget = useMemo(
    () =>
      resolveSiteSavedContentTargetFromRunResult(
        siteSkillExecutionState?.result || null,
      ),
    [siteSkillExecutionState?.result],
  );
  const currentTurnThreadItems = useMemo(
    () =>
      currentTurnId &&
      hasPreferredServiceSkillResultFileTargetSignals({
        currentTurnId,
        threadItems: effectiveThreadItems,
        savedContentTarget: siteSkillSavedContentTarget,
      })
        ? effectiveThreadItems.filter((item) => item.turn_id === currentTurnId)
        : [],
    [currentTurnId, effectiveThreadItems, siteSkillSavedContentTarget],
  );
  const preferredServiceSkillResultFileTarget = useMemo(
    () =>
      currentTurnThreadItems.length > 0 || siteSkillSavedContentTarget
        ? resolvePreferredServiceSkillResultFileTarget({
            threadItems: currentTurnThreadItems,
            savedContentTarget: siteSkillSavedContentTarget,
          })
        : null,
    [currentTurnThreadItems, siteSkillSavedContentTarget],
  );
  const handleOpenServiceSkillResultFile = useCallback(
    async (relativePath: string) => {
      const normalizedPath = relativePath.trim();
      if (!normalizedPath) {
        return;
      }

      const absolutePath = resolveAbsoluteWorkspacePath(
        project?.rootPath,
        normalizedPath,
      );
      if (absolutePath) {
        const opened = await openProjectFilePreviewInCanvas({
          relativePath: normalizedPath,
          absolutePath,
        });
        if (opened) {
          return;
        }
      }

      const matchedTaskFile = taskFiles.find((file) =>
        doesWorkspaceFileCandidateMatch(file.name, normalizedPath),
      );
      if (matchedTaskFile) {
        handleWorkspaceFileClick(
          matchedTaskFile.name,
          matchedTaskFile.content ?? "",
        );
        return;
      }

      if (absolutePath) {
        return;
      }

      toast.error("打开结果文件失败：当前工作区里还没有同步到这份文件");
    },
    [
      handleWorkspaceFileClick,
      openProjectFilePreviewInCanvas,
      project?.rootPath,
      taskFiles,
    ],
  );
  useEffect(() => {
    const relativePath = initialProjectFileOpenTarget?.relativePath?.trim();
    if (!relativePath) {
      handledInitialProjectFileOpenSignatureRef.current = "";
      return;
    }

    if (contentId && isInitialContentLoading) {
      return;
    }

    if (!project?.rootPath && !isAbsoluteWorkspacePath(relativePath)) {
      return;
    }

    const absolutePath = resolveAbsoluteWorkspacePath(
      project?.rootPath,
      relativePath,
    );
    if (!absolutePath) {
      return;
    }

    const signature = JSON.stringify({
      projectId: projectId ?? "",
      contentId: contentId ?? "",
      relativePath,
      requestKey: initialProjectFileOpenTarget?.requestKey ?? 0,
    });
    if (handledInitialProjectFileOpenSignatureRef.current === signature) {
      return;
    }
    handledInitialProjectFileOpenSignatureRef.current = signature;

    let cancelled = false;
    void (async () => {
      await openProjectFilePreviewInCanvas({
        relativePath,
        absolutePath,
        isCancelled: () => cancelled,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    contentId,
    initialProjectFileOpenTarget,
    isInitialContentLoading,
    openProjectFilePreviewInCanvas,
    project?.rootPath,
    projectId,
  ]);
  const serviceSkillExecutionCard = useMemo(
    () =>
      siteSkillExecutionState ? (
        <ServiceSkillExecutionCard
          state={siteSkillExecutionState}
          onOpenBrowserRuntime={
            siteSkillExecutionState.phase === "blocked"
              ? handleOpenBrowserRuntimeForSiteSkillExecution
              : undefined
          }
          preferredResultFileTarget={preferredServiceSkillResultFileTarget}
          onOpenResultFile={handleOpenServiceSkillResultFile}
          onOpenSavedSiteContent={handleOpenSavedSiteContent}
        />
      ) : null,
    [
      handleOpenServiceSkillResultFile,
      handleOpenBrowserRuntimeForSiteSkillExecution,
      handleOpenSavedSiteContent,
      preferredServiceSkillResultFileTarget,
      siteSkillExecutionState,
    ],
  );
  const sceneAppExecutionSurfaceRuntime =
    useWorkspaceSceneAppExecutionSurfaceRuntime({
      artifacts,
      initialSummary: initialSceneAppExecutionSummary,
      isSending,
      onApplyFollowUpAction: applyWorkbenchFollowUpActionPayload,
      onNavigate: _onNavigate,
      onOpenArtifact: handleArtifactClick,
      onOpenTaskFile: handleTaskFileClick,
      onOpenWorkspaceFile: handleWorkspaceFileClick,
      projectId,
      readSessionFile,
      replayReferenceEntries:
        initialCreationReplaySurface?.defaultReferenceEntries,
      replayReferenceMemoryIds:
        initialCreationReplaySurface?.defaultReferenceMemoryIds,
      sessionFiles,
      sessionId,
      taskFiles,
    });
  const {
    defaultCuratedTaskReferenceEntries,
    defaultCuratedTaskReferenceMemoryIds,
    reviewDecisionDialogNode: sceneAppReviewDecisionDialogNode,
    summaryCard: sceneAppExecutionSummaryCard,
  } = sceneAppExecutionSurfaceRuntime;
  const handleJumpToTimelineItem = useCallback(
    (itemId: string) => {
      if (!workbenchRequests.jumpToTimelineItem(itemId)) {
        return;
      }

      setLayoutMode((current) =>
        current === "canvas" ? "chat-canvas" : current,
      );
    },
    [workbenchRequests],
  );
  const triggerAIGuideRef = useRef(triggerAIGuide);
  triggerAIGuideRef.current = triggerAIGuide;
  useGeneralWorkbenchInitialAutoGuideRuntime({
    autoRunInitialPromptOnMount,
    canvasState,
    contentId,
    consumedInitialPromptRef,
    generalWorkbenchEntryCheckPending,
    generalWorkbenchEntryPrompt,
    handleSend,
    hasProject: Boolean(project),
    hasTriggeredGuideRef,
    initialAutoSendAllowsDetachedSession,
    initialAutoSendRequestMetadata,
    initialDispatchKey,
    initialUserPrompt,
    initialUserImages,
    isSending,
    isThemeWorkbench,
    mappedTheme,
    messagesLength: messages.length,
    onInitialUserPromptConsumed,
    projectId,
    sessionId,
    setInput,
    shouldSkipGeneralWorkbenchAutoGuideWithoutPrompt,
    shouldUseCompactGeneralWorkbench,
    systemPrompt,
    triggerAIGuideRef,
  });

  useWorkspaceImageWorkbenchEventRuntime({
    canvasState,
    projectId,
    contentId,
    setImageWorkbenchSelectedSize,
    setCanvasState,
    updateCurrentImageWorkbenchState,
    handleImageWorkbenchCommand,
    onImageWorkbenchRequested:
      imageWorkbenchGenerationRuntime.ensureProvidersLoaded,
  });

  useWorkspaceVideoTaskPreviewRuntime({
    projectRootPath: project?.rootPath || null,
    messages,
    setChatMessages,
  });
  useWorkspaceAudioTaskPreviewRuntime({
    projectRootPath: project?.rootPath || null,
    messages,
    setChatMessages,
  });
  useWorkspaceTranscriptionTaskPreviewRuntime({
    projectRootPath: project?.rootPath || null,
    messages,
    setChatMessages,
  });
  useWorkspaceVideoTaskActionRuntime({
    projectRootPath: project?.rootPath || null,
    projectId,
    contentId,
    setChatMessages,
  });

  const shellChromeRuntime = useMemo(() => {
    return resolveWorkspaceShellChromeRuntime({
      activeTheme,
      agentEntry,
      contextWorkspaceEnabled: contextWorkspace.generalWorkbenchEnabled,
      effectiveShowChatPanel,
      gateStatus: currentGate.status,
      generalWorkbenchPanelCollapseEnabled:
        generalWorkbenchScaffoldRuntime.enableGeneralWorkbenchPanelCollapse,
      generalWorkbenchSidebarCollapsed:
        generalWorkbenchScaffoldRuntime.generalWorkbenchSidebarCollapsed,
      hasCanvasWorkbenchContent,
      hasDisplayMessages,
      hasHomeConversationActivity,
      hasPendingA2UIForm,
      hideTopBar,
      isBootstrapDispatchPending,
      isPreparingSend,
      isSending,
      isTaskCenterDraftSendPending,
      isThemeWorkbench,
      layoutMode,
      normalizedInitialSessionId,
      queuedTurnCount: queuedTurns.length,
      sessionId,
      shouldRenderTaskCenterEmbeddedHome,
      shouldSuppressTaskCenterDraftContent,
      shouldUseBrowserWorkspaceHomeChrome,
      shouldUseCompactGeneralWorkbench,
      showSidebar,
      subagentsRuntimeVisible: teamSessionRuntime.subagentsRuntimeVisible,
      hasRuntimeSessions: teamSessionRuntime.hasRuntimeSessions,
      hasTeamDispatchPreview: Boolean(teamDispatchPreviewState),
      themeWorkbenchRunState,
      topBarChrome,
    });
  }, [
    agentEntry,
    activeTheme,
    contextWorkspace.generalWorkbenchEnabled,
    currentGate.status,
    effectiveShowChatPanel,
    generalWorkbenchScaffoldRuntime.enableGeneralWorkbenchPanelCollapse,
    generalWorkbenchScaffoldRuntime.generalWorkbenchSidebarCollapsed,
    hasDisplayMessages,
    hasHomeConversationActivity,
    hasCanvasWorkbenchContent,
    hasPendingA2UIForm,
    hideTopBar,
    isBootstrapDispatchPending,
    isPreparingSend,
    isTaskCenterDraftSendPending,
    isSending,
    isThemeWorkbench,
    layoutMode,
    normalizedInitialSessionId,
    sessionId,
    queuedTurns.length,
    shouldRenderTaskCenterEmbeddedHome,
    shouldSuppressTaskCenterDraftContent,
    shouldUseBrowserWorkspaceHomeChrome,
    shouldUseCompactGeneralWorkbench,
    showSidebar,
    teamDispatchPreviewState,
    teamSessionRuntime.hasRuntimeSessions,
    teamSessionRuntime.subagentsRuntimeVisible,
    themeWorkbenchRunState,
    topBarChrome,
  ]);
  const showGeneralWorkbenchSidebar =
    shellChromeRuntime.showGeneralWorkbenchSidebar;
  const showGeneralWorkbenchLeftExpandButton =
    shellChromeRuntime.showGeneralWorkbenchLeftExpandButton;
  const generalWorkbenchSidebarRuntime =
    useWorkspaceGeneralWorkbenchSidebarRuntime({
      isThemeWorkbench,
      sidebarVisible: showGeneralWorkbenchSidebar,
      sessionId,
      messages,
      isSending,
      themeWorkbenchBackendRunState,
      contextActivityLogs: contextWorkspace.activityLogs,
      historyPageSize: GENERAL_WORKBENCH_HISTORY_PAGE_SIZE,
    });
  const handleDeleteGeneralWorkbenchVersion = useCallback(() => undefined, []);
  const handleCollapseGeneralWorkbenchSidebar = useCallback(() => {
    generalWorkbenchScaffoldRuntime.setGeneralWorkbenchSidebarCollapsed(true);
  }, [generalWorkbenchScaffoldRuntime]);
  const handleExpandGeneralWorkbenchSidebar = useCallback(() => {
    generalWorkbenchScaffoldRuntime.setGeneralWorkbenchSidebarCollapsed(false);
  }, [generalWorkbenchScaffoldRuntime]);
  const handleApplyGeneralWorkbenchFollowUpAction =
    applyWorkbenchFollowUpActionPayload;
  const handleSubmitCodeFixPrompt = useCallback(
    async (prompt: string) => {
      const normalizedPrompt = prompt.trim();
      if (!normalizedPrompt) {
        return;
      }

      await handleSendRef.current(
        [],
        undefined,
        undefined,
        normalizedPrompt,
        "react",
        undefined,
        {
          skipSceneCommandRouting: true,
          displayContent: normalizedPrompt,
          requestMetadata: {
            harness: {
              code_fix: {
                source: "failed_output",
              },
            },
          },
        },
      );
    },
    [handleSendRef],
  );
  const handleManageProvidersFromHarness = useCallback(
    (focus?: ProviderSettingsFocusContext) => {
      _onNavigate?.("settings", {
        tab: SettingsTabs.Providers,
        providerView: "settings",
        ...(focus ? { providerFocus: focus } : {}),
      });
    },
    [_onNavigate],
  );
  const handleOpenExecutionPolicySettingsFromHarness = useCallback(
    (focus?: ExecutionPolicyFocusContext) => {
      _onNavigate?.("settings", {
        tab: SettingsTabs.ExecutionPolicy,
        ...(focus ? { executionPolicyFocus: focus } : {}),
      });
    },
    [_onNavigate],
  );
  const effectiveInitialInputCapability = useMemo(
    () =>
      resolveEffectiveInitialInputCapability({
        bootstrap: initialInputCapability,
        runtime: runtimeInitialInputCapability,
      }),
    [initialInputCapability, runtimeInitialInputCapability],
  );
  const planComposerDecision = useMemo(
    () =>
      selectLatestPlanComposerDecision(
        pendingActions,
        submittedActionsInFlight,
      ),
    [pendingActions, submittedActionsInFlight],
  );
  const planComposerPendingActions = useMemo(
    () =>
      filterPlanComposerDecisionFromPendingActions(
        pendingActions,
        planComposerDecision,
      ) ?? [],
    [pendingActions, planComposerDecision],
  );
  const harnessState = useMemo(
    () =>
      harnessPanelVisible
        ? deriveHarnessSessionState(
            messages,
            pendingActions,
            effectiveThreadItems,
            todoItems,
          )
        : ({
            ...harnessShellState,
            reasoning: undefined,
            activity: {
              planning: 0,
              filesystem: 0,
              execution: 0,
              web: 0,
              skills: 0,
              delegation: 0,
            },
            delegatedTasks: [],
            outputSignals: [],
            activeFileWrites: [],
            recentFileEvents: [],
          } satisfies HarnessSessionState),
    [
      effectiveThreadItems,
      harnessPanelVisible,
      harnessShellState,
      messages,
      pendingActions,
      todoItems,
    ],
  );
  const [dismissedLocalPlanRequestIds, setDismissedLocalPlanRequestIds] =
    useState<Set<string>>(() => new Set());
  const [submittedLocalPlanRequestIds, setSubmittedLocalPlanRequestIds] =
    useState<Set<string>>(() => new Set());
  const [
    dismissedLocalPlanConfirmationKeys,
    setDismissedLocalPlanConfirmationKeys,
  ] = useState<Set<string>>(() => new Set());
  const [
    submittedLocalPlanConfirmationKeys,
    setSubmittedLocalPlanConfirmationKeys,
  ] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setDismissedLocalPlanRequestIds(new Set());
    setSubmittedLocalPlanRequestIds(new Set());
    setDismissedLocalPlanConfirmationKeys(new Set());
    setSubmittedLocalPlanConfirmationKeys(new Set());
  }, [sessionId]);
  const localPlanImplementationDecision = useMemo(
    () =>
      !planComposerDecision &&
      !isSending &&
      hasProposedPlanImplementationSignals({
        messages: displayMessages,
        planState: harnessShellState.plan,
        threadItems: effectiveThreadItems,
      })
        ? selectProposedPlanImplementationDecision({
            dismissedConfirmationKeys: dismissedLocalPlanConfirmationKeys,
            dismissedRequestIds: dismissedLocalPlanRequestIds,
            messages: displayMessages,
            planState: harnessShellState.plan,
            submittedConfirmationKeys: submittedLocalPlanConfirmationKeys,
            submittedRequestIds: submittedLocalPlanRequestIds,
            threadItems: effectiveThreadItems,
          })
        : null,
    [
      harnessShellState.plan,
      dismissedLocalPlanConfirmationKeys,
      dismissedLocalPlanRequestIds,
      displayMessages,
      effectiveThreadItems,
      isSending,
      planComposerDecision,
      submittedLocalPlanConfirmationKeys,
      submittedLocalPlanRequestIds,
    ],
  );
  const handleDismissLocalPlanImplementationDecision = useCallback(
    (requestId: string, requestArguments?: unknown) => {
      setDismissedLocalPlanRequestIds((previous) => {
        if (previous.has(requestId)) {
          return previous;
        }
        const next = new Set(previous);
        next.add(requestId);
        return next;
      });
      const confirmationKeys =
        readPlanImplementationConfirmationKeys(requestArguments);
      if (confirmationKeys.length > 0) {
        setDismissedLocalPlanConfirmationKeys((previous) => {
          const next = new Set(previous);
          confirmationKeys.forEach((key) => next.add(key));
          return next;
        });
      }
    },
    [],
  );
  const handleLocalPlanImplementationSubmit = useCallback(
    async (response: ConfirmResponse) => {
      const acceptedLabel = t("agentChat.planComposerDecision.option.accept");
      const submitPlan = buildPlanImplementationSubmitPlan({
        acceptedLabel,
        effectiveChatToolPreferences,
        requestArguments: localPlanImplementationDecision?.action.arguments,
        response,
      });
      if (submitPlan.kind === "invalid") {
        return;
      }
      if (submitPlan.kind === "dismiss") {
        handleDismissLocalPlanImplementationDecision(
          submitPlan.requestId,
          localPlanImplementationDecision?.action.arguments,
        );
        return;
      }

      const sendResult = await handleSendRef.current(
        [],
        undefined,
        undefined,
        submitPlan.textOverride,
        "react",
        undefined,
        submitPlan.sendOptions,
      );

      if (!sendResult) {
        return;
      }

      setSubmittedLocalPlanRequestIds((previous) => {
        if (previous.has(submitPlan.requestId)) {
          return previous;
        }
        const next = new Set(previous);
        next.add(submitPlan.requestId);
        return next;
      });
      if (submitPlan.confirmationKeys.length > 0) {
        setSubmittedLocalPlanConfirmationKeys((previous) => {
          const next = new Set(previous);
          submitPlan.confirmationKeys.forEach((key) => next.add(key));
          return next;
        });
      }
    },
    [
      effectiveChatToolPreferences,
      handleDismissLocalPlanImplementationDecision,
      handleSendRef,
      localPlanImplementationDecision?.action.arguments,
      t,
    ],
  );
  const planDecisionAccessory = planComposerDecision ? (
    <PlanComposerDecisionPanel
      request={planComposerDecision}
      onSubmit={handlePermissionResponse}
    />
  ) : localPlanImplementationDecision ? (
    <PlanComposerDecisionPanel
      request={localPlanImplementationDecision.action}
      onSubmit={handleLocalPlanImplementationSubmit}
      onDismiss={(requestId) =>
        handleDismissLocalPlanImplementationDecision(
          requestId,
          localPlanImplementationDecision.action.arguments,
        )
      }
    />
  ) : undefined;
  const isReadModelRunning = hasRunningThreadReadActivity(threadRead);
  const inputbarIsSending = isSending || isReadModelRunning;
  useEffect(() => {
    onAgentStreamingChange?.(inputbarIsSending);
  }, [inputbarIsSending, onAgentStreamingChange]);

  const generalWorkbenchHarnessPanelBaseProps = {
    environment: contextHarnessRuntime.harnessEnvironment,
    childSubagentSessions,
    selectedTeamLabel,
    selectedTeamSummary,
    selectedTeamRoles: selectedTeam?.roles,
    teamMemorySnapshot: resolvedTeamMemoryShadowSnapshot,
    threadRead,
    turns,
    threadItems: effectiveThreadItems,
    currentTurnId,
    pendingActions: planComposerPendingActions,
    submittedActionsInFlight,
    onRespondToAction: handlePermissionResponse,
    queuedTurns,
    canInterrupt: inputbarIsSending,
    onInterruptCurrentTurn: stopSending,
    onResumeThread: resumeThread,
    onReplayPendingRequest:
      latestAssistantMessageId && replayPendingAction
        ? (requestId: string) =>
            replayPendingAction(requestId, latestAssistantMessageId)
        : undefined,
    onPromoteQueuedTurn: promoteQueuedTurn,
    onObjectiveChanged: async () => {
      await refreshSessionReadModel(sessionId || undefined);
    },
    onManageProviders: handleManageProvidersFromHarness,
    onOpenExecutionPolicySettings: handleOpenExecutionPolicySettingsFromHarness,
    messages: displayMessages,
    diagnosticRuntimeContext: {
      sessionId: sessionId || null,
      workspaceId: projectId,
      workingDir: project?.rootPath || null,
      providerType:
        activeExecutionRuntime?.provider_selector || providerType || null,
      model: activeExecutionRuntime?.model_name || model || null,
      executionStrategy: executionStrategy || null,
      activeTheme: activeTheme || null,
      selectedTeamLabel,
    },
    toolInventory: harnessInventoryRuntime.toolInventory,
    toolInventoryLoading: harnessInventoryRuntime.toolInventoryLoading,
    toolInventoryError: harnessInventoryRuntime.toolInventoryError,
    onRefreshToolInventory: harnessInventoryRuntime.refreshToolInventory,
    mcpPrepareCandidateCount: harnessInventoryRuntime.mcpPrepareCandidateCount,
    mcpPrepareLoading: harnessInventoryRuntime.mcpPrepareLoading,
    mcpPrepareError: harnessInventoryRuntime.mcpPrepareError,
    onPrepareMcpTargets: harnessInventoryRuntime.prepareMcpTargets,
    onOpenSubagentSession: handleOpenSubagentSession,
    onLoadFilePreview: handleHarnessLoadFilePreview,
    onOpenFile: handleWorkspaceFileClick,
    onSubmitCodeFixPrompt: handleSubmitCodeFixPrompt,
  } satisfies Omit<
    ComponentProps<typeof GeneralWorkbenchHarnessSurfaceSection>,
    "enabled" | "harnessState"
  >;
  useWorkspaceHiddenWorkflowProgressRuntime({
    hasMessages,
    isSpecializedThemeMode,
    onWorkflowProgressChange,
  });
  const navigationActions = useWorkspaceNavigationActions({
    applyProjectSelection,
    compactSession,
    dismissWorkspacePathError,
    fixWorkspacePathAndRetry,
    agentEntry,
    externalProjectId,
    onNavigate: _onNavigate,
    projectId: projectId || undefined,
    setEntryBannerVisible,
    setWorkspaceHealthError,
    workspacePathMissing,
  });
  const handleSaveMessageAsSkill = useCallback(
    (source: { messageId: string; content: string }) => {
      if (!_onNavigate) {
        toast.error("当前入口暂不支持直接跳转到 Skill 页面");
        return;
      }

      const nextPageParams = buildSkillsPageParamsFromMessage(source, {
        creationProjectId: projectId,
        creationReplay: initialCreationReplay,
      });
      if (!nextPageParams?.initialScaffoldDraft) {
        toast.error("这条结果暂时还不足以生成技能草稿");
        return;
      }

      _onNavigate("skills", nextPageParams);
      toast.success("已带着这条结果去新建 Skill");
    },
    [_onNavigate, initialCreationReplay, projectId],
  );

  const inputbarScene = useWorkspaceInputbarSceneRuntime({
    contextVariant: agentEntry === "claw" ? "task-center" : "default",
    setMentionedCharacters,
    taskFiles,
    selectedFileId,
    isThemeWorkbench,
    sessionId,
    childSubagentSessions,
    subagentParentContext,
    selectedTeamLabel,
    selectedTeamSummary,
    teamMemorySnapshot: resolvedTeamMemoryShadowSnapshot,
    currentSessionTitle: teamSessionRuntime.currentSessionTitle,
    handleStopSending: teamSessionControlRuntime.handleStopSending,
    handleOpenSubagentSession,
    input,
    setInput,
    currentGate,
    generalWorkbenchWorkflowSteps:
      generalWorkbenchSidebarRuntime.generalWorkbenchWorkflowSteps,
    steps: EMPTY_WORKSPACE_WORKFLOW_STEPS,
    workflowRunState: themeWorkbenchRunState,
    handleSend,
    isPreparingSend,
    isSending: inputbarIsSending,
    isSessionRestoring:
      isAutoRestoringSession ||
      isSessionHydrating ||
      taskCenterHomeSurfaceState.isRestoringSession,
    providerType,
    setProviderType,
    model,
    setModel,
    reasoningEffort,
    setReasoningEffort,
    sessionExecutionRuntime: executionRuntime,
    projectId: projectId ?? null,
    openedProjects,
    projectRootPath: project?.rootPath || null,
    accessMode,
    setAccessMode,
    activeTheme,
    navigationActions,
    selectedTeam,
    characters: projectMemory?.characters || [],
    skills,
    serviceSkills: activeTheme === "general" ? serviceSkills : [],
    serviceSkillGroups: activeTheme === "general" ? serviceSkillGroups : [],
    skillsLoading: combinedSkillsLoading,
    onSelectServiceSkill:
      workspaceServiceSkillEntryActions.handleServiceSkillSelect,
    onSkillSuggestionsNeeded: handleSkillSuggestionsNeeded,
    initialInputCapability: effectiveInitialInputCapability,
    initialKnowledgePackSelection,
    pluginSuggestions: workspacePluginInputSuggestions,
    pluginSuggestionsError:
      workspacePluginRuntimeContext.error?.message ?? null,
    pluginSuggestionsLoading: workspacePluginRuntimeContext.loading,
    onPluginSuggestionsNeeded: handlePluginSuggestionsNeeded,
    setChatToolPreferences,
    objectiveEnabled: inputbarObjectiveModeEnabled,
    onObjectiveEnabledChange: setInputbarObjectiveModeEnabled,
    handleNavigateToSkillSettings,
    handleRefreshSkills,
    soulArtifactVoiceGenerationBrief,
    soulArtifactVoiceEnabledForTurn,
    onSoulArtifactVoiceEnabledForTurnChange: setSoulArtifactVoiceEnabledForTurn,
    turns,
    threadItems: effectiveThreadItems,
    currentTurnId,
    threadRead,
    activeExecutionRuntime,
    pendingActions: planComposerPendingActions,
    submittedActionsInFlight,
    onRespondToAction: handlePermissionResponse,
    messages: displayMessages,
    queuedTurns,
    resumeThread,
    replayPendingAction,
    promoteQueuedTurn,
    onObjectiveChanged: async () => {
      await refreshSessionReadModel(sessionId || undefined);
    },
    removeQueuedTurn,
    latestAssistantMessageId,
    sessionIdForDiagnostics: sessionId || null,
    generalWorkbenchEntryPrompt,
    handleRestartGeneralWorkbenchEntryPrompt,
    handleContinueGeneralWorkbenchEntryPrompt,
    planDecisionAccessory,
    generalWorkbenchEnabled:
      generalHarnessEntryEnabled && !suppressHomeNavbarUtilityActions,
    harnessPanelVisible:
      !suppressHomeNavbarUtilityActions &&
      contextHarnessRuntime.harnessPanelVisible,
    setHarnessPanelVisible: contextHarnessRuntime.setHarnessPanelVisible,
    harnessState,
    harnessEnvironment: contextHarnessRuntime.harnessEnvironment,
    toolInventory: harnessInventoryRuntime.toolInventory,
    toolInventoryLoading: harnessInventoryRuntime.toolInventoryLoading,
    toolInventoryError: harnessInventoryRuntime.toolInventoryError,
    refreshToolInventory: harnessInventoryRuntime.refreshToolInventory,
    mcpPrepareCandidateCount: harnessInventoryRuntime.mcpPrepareCandidateCount,
    mcpPrepareLoading: harnessInventoryRuntime.mcpPrepareLoading,
    mcpPrepareError: harnessInventoryRuntime.mcpPrepareError,
    prepareMcpTargets: harnessInventoryRuntime.prepareMcpTargets,
    mappedTheme,
    activeRuntimeStatusTitle: contextHarnessRuntime.activeRuntimeStatusTitle,
    handleHarnessLoadFilePreview,
    handleFileClick: handleWorkspaceFileClick,
    chatToolPreferences: effectiveChatToolPreferences,
    defaultCuratedTaskReferenceMemoryIds: defaultCuratedTaskReferenceMemoryIds,
    defaultCuratedTaskReferenceEntries: defaultCuratedTaskReferenceEntries,
    pathReferences,
    onAddPathReferences: handleAddPathReferences,
    inputRestoreRequest,
    onInputRestoreRequestHandled: handleInputRestoreRequestHandled,
    onRemovePathReference: handleRemovePathReference,
    onClearPathReferences: handleClearPathReferences,
    fileManagerOpen: fileManagerSidebar.fileManagerOpen,
    onToggleFileManager: fileManagerSidebar.fileManagerAvailable
      ? fileManagerSidebar.toggleFileManagerSidebar
      : undefined,
    inputCompletionEnabled,
  });
  const importTextAsKnowledge = inputbarScene.onImportTextAsKnowledge;
  const handleSaveMessageAsKnowledge = useCallback(
    (source: {
      messageId: string;
      content: string;
      sourceName?: string;
      description?: string | null;
    }) => {
      const sourceText = source.content.trim();
      if (!sourceText) {
        toast.error("这条结果暂时没有可沉淀的内容");
        return;
      }
      if (!isUsableKnowledgeSourceText(sourceText)) {
        toast.info("这条结果还不是可复用资料，请先补充原始内容后再沉淀。");
        return;
      }

      const savePageParams = buildKnowledgeSavePageParams({
        projectRootPath: project?.rootPath,
        knowledgeSelectionWorkingDir:
          inputbarScene.knowledgePackSelection?.workingDir,
        selectedPackName: inputbarScene.knowledgePackSelection?.packName,
        currentSessionTitle: teamSessionRuntime.currentSessionTitle,
        source: {
          ...source,
          content: sourceText,
        },
      });
      if (_onNavigate && savePageParams) {
        _onNavigate("knowledge", savePageParams);
        return;
      }

      importTextAsKnowledge({
        sourceName:
          source.sourceName?.trim() || `agent-output-${source.messageId}.md`,
        sourceText,
        description:
          source.description?.trim() ||
          teamSessionRuntime.currentSessionTitle ||
          "对话结果资料",
        packType: "custom",
      });
    },
    [
      _onNavigate,
      importTextAsKnowledge,
      inputbarScene.knowledgePackSelection?.workingDir,
      inputbarScene.knowledgePackSelection?.packName,
      project?.rootPath,
      teamSessionRuntime.currentSessionTitle,
    ],
  );

  const canvasScene = useWorkspaceCanvasSceneRuntime({
    shouldBootstrapCanvasOnEntry,
    normalizedEntryTheme,
    mappedTheme,
    canvasState,
    resolvedCanvasState,
    isInitialContentLoading,
    initialContentLoadError,
    imageWorkbenchGenerationRuntime,
    imageWorkbenchActionRuntime,
    inputbarScene,
    projectRootPath: project?.rootPath || null,
    generalCanvasState,
    setGeneralCanvasState,
    currentCanvasArtifact,
    displayedCanvasArtifact,
    artifactDisplayState,
    artifactViewMode,
    setArtifactViewMode: handleArtifactViewModeChange,
    artifactPreviewSize,
    setArtifactPreviewSize,
    onSaveArtifactDocument: handleSaveArtifactDocument,
    onArtifactBlockRewriteRun: handleArtifactBlockRewriteRun,
    renderArtifactWorkbenchToolbarActions,
    threadItems: effectiveThreadItems,
    focusedBlockId: workbenchRequests.focusedArtifactBlockId,
    blockFocusRequestKey: workbenchRequests.artifactBlockFocusRequestKey,
    onJumpToTimelineItem: handleJumpToTimelineItem,
    handleCloseCanvas,
    currentImageWorkbenchState,
    imageWorkbenchPreferenceSummary,
    imageWorkbenchPreferenceWarning,
    setCanvasState,
    handleBackHome,
    isSending,
    handleCanvasSelectionTextChange,
    projectId: projectId ?? null,
    contentId: contentId ?? null,
    imageGenerationSelectionReady,
    imageGenerationSelectionWarning,
    sourceThreadId: sessionId ?? null,
    providerType,
    setProviderType,
    model,
    setModel,
    handleDocumentAutoContinueRun,
    handleAddImage,
    handleImportDocument,
    handleDocumentContentReviewRun,
    handleDocumentTextStylizeRun,
    preferContentReviewInRightRail,
  });

  const shouldHideCurrentSessionContent =
    taskCenterHomeSurfaceState.shouldHideCurrentSessionContent;
  const sceneIsRestoringSession = taskCenterHomeSurfaceState.isRestoringSession;
  const {
    handleSendFromEmptyState,
    sceneDisplayMessages,
    sceneTurns,
    sceneThreadItems,
    sceneCurrentTurnId,
    sceneThreadRead,
    sceneExecutionRuntime,
    scenePendingActions,
    sceneSubmittedActionsInFlight,
    sceneQueuedTurns,
    sceneIsPreparingSend,
    sceneIsSending,
  } = useWorkspaceTaskCenterSendRuntime({
    activeDraftTabIdRef: activeTaskCenterDraftTabIdRef,
    activeSessionIdRef,
    agentEntry,
    clearMessages,
    commitMaterializedDraftTab: commitMaterializedTaskCenterDraftTab,
    currentSessionId: sessionId,
    currentTurnId,
    shouldHideCurrentSessionContent,
    displayMessages,
    effectiveThreadItems,
    executionRuntime,
    handleSend,
    hasDisplayMessages,
    homePendingPreviewMessages,
    bootstrapPendingPreviewMessages,
    input,
    isPreparingSend,
    isSending,
    isTaskCenterDraftSendPending,
    markNewChatRequestHandled,
    markTaskCenterLocalSessionOverride,
    materializedSessionIdsRef: taskCenterDraftMaterializedSessionIdsRef,
    materializeDraftTab: materializeTaskCenterDraftTab,
    messagesLength: messages.length,
    newChatAt,
    persistMaterializedSessionNavigation:
      persistTaskCenterMaterializedSessionNavigation,
    planComposerPendingActions,
    prewarmedDraftSessionIdsRef: taskCenterDraftWarmupSessionIdsRef,
    queuedTurns,
    sendRef: handleSendRef,
    setActiveDraftTabId: setActiveTaskCenterDraftTabId,
    setDetachedTopicId: setTaskCenterDetachedTopicId,
    setHomePendingPreviewRequest,
    setInput,
    setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs,
    setTransitionTopicId: setTaskCenterTransitionTopicId,
    submittedActionsInFlight,
    taskCenterDraftSendRequest,
    taskCenterDraftSurfaceActiveRef,
    taskCenterWorkspaceId,
    threadRead,
    turns,
    upsertTaskCenterOpenTab,
  });
  const sceneSessionId = taskCenterHomeSurfaceState.sceneSessionId;
  const sceneMessageListEmptyStateVariant =
    agentEntry === "claw" &&
    !(agentEntry === "claw" && normalizedInitialSessionId) &&
    !shouldRenderTaskCenterEmbeddedHome &&
    !shouldSuppressTaskCenterDraftContent
      ? "task-center"
      : "none";
  const sceneLayoutMode = shouldRenderTaskCenterEmbeddedHome
    ? "chat"
    : layoutMode;
  const hasExpertInfoPanel = Boolean(expertPanelRuntimeKey);
  const previousExpertInfoPanelLayoutModeRef =
    useRef<LayoutMode>(sceneLayoutMode);
  useEffect(() => {
    const previousLayoutMode = previousExpertInfoPanelLayoutModeRef.current;
    if (previousLayoutMode !== sceneLayoutMode) {
      setExpertInfoPanelCollapsed((currentCollapsed) =>
        resolveExpertInfoPanelCollapsedAfterLayoutChange({
          previousLayoutMode,
          nextLayoutMode: sceneLayoutMode,
          currentCollapsed,
        }),
      );
    }
    previousExpertInfoPanelLayoutModeRef.current = sceneLayoutMode;
  }, [sceneLayoutMode]);
  const expertInfoPanelVisible =
    hasExpertInfoPanel &&
    !expertInfoPanelCollapsed &&
    sceneLayoutMode === "chat";
  const canvasWorkbenchRootPath =
    sessionWorkingDir?.trim() || project?.rootPath || null;
  const shellRightSurfaceAvailable = Boolean(canvasWorkbenchRootPath);
  const { handleArticleWorkspaceImageSlotIntent } =
    useWorkspaceArticleEditorImageSlotRuntime({
      contentId,
      handleImageWorkbenchCommand,
      projectId,
      setLayoutMode,
    });
  const {
    articleEditorRightSurface,
    articleEditorRightSurfaceAvailable,
    handleArticleWorkspaceMarkdownChange,
    sceneDisplayMessagesWithArticleWorkspaceArtifact,
  } = useWorkspaceArticleEditorRightSurfaceRuntime({
    activeArticleWorkspace: rightSurfaceLocalState.activeArticleWorkspace,
    canvasState,
    canvasWorkbenchRootPath,
    contentId,
    currentImageWorkbenchState,
    imageWorkbenchSessionKey,
    messages,
    onImageSlotIntent: handleArticleWorkspaceImageSlotIntent,
    projectId,
    runtimeWorkspaceId,
    sceneDisplayMessages,
    sceneIsPreparingSend,
    sceneIsSending,
    sceneSessionId,
    sceneThreadRead,
    setCanvasState,
    setChatMessages,
    shouldDeferWorkspaceAuxiliaryLoads,
    shouldHideCurrentSessionContent,
    shouldRestoreImageTasksFromWorkspace,
    updateCurrentImageWorkbenchState,
  });
  bindArticleEditorRightSurface(articleEditorRightSurface);
  const rightSurfaceRuntime = useWorkspaceRightSurfaceCoordinatorRuntime({
    articleEditorRightSurface,
    articleEditorRightSurfaceAvailable,
    bindRightSurfacePendingActions,
    browserAssistLaunching,
    browserAssistSessionRef,
    browserAssistSessionState,
    canvasWorkbenchRootPath,
    clawTraceEnabled,
    currentBrowserAssistScopeKey,
    expertInfoPanelCollapsed,
    expertInfoPanelVisible,
    handleToggleCanvas,
    harnessPendingCount,
    hasExpertInfoPanel,
    localState: rightSurfaceLocalState,
    pluginRuntimeContext: workspacePluginRuntimeContext.context,
    preferredServiceSkillResultFileTarget,
    runtimeWorkspaceId,
    sceneIsPreparingSend,
    sceneIsSending,
    sceneLayoutMode,
    sceneSessionId,
    sessionId,
    shellRightSurfaceAvailable,
    showHarnessToggle,
    suppressHomeNavbarUtilityActions,
    taskCenterHomeHotpathActive:
      shouldRenderTaskCenterEmbeddedHome ||
      Boolean(taskCenterDraftSendRequest || homePendingPreviewRequest),
    setExpertInfoPanelCollapsed,
    setHarnessPanelVisible,
    setLayoutMode,
  });
  const {
    handleToggleCanvasFromRightSurface,
    handleToggleExpertInfoPanel,
    handleToggleRightSurfaceBrowser,
    handleToggleRightSurfaceFiles,
    handleToggleRightSurfaceHarness,
    handleToggleRightSurfaceObjectCanvas,
    handleToggleRightSurfaceShell,
    handleToggleRightSurfaceTrace,
    rightSurfaceLaunchers,
    rightSurfaceState,
  } = rightSurfaceRuntime;
  const rightSurfaceContent = useWorkspaceRightSurfaceHostRuntime({
    articleActionsDisabled: sceneIsSending || sceneIsPreparingSend,
    articleEditorRightSurface,
    canvasWorkbenchRootPath,
    expertInfoPanelProps: {
      requestMetadata: expertPanelRequestMetadata,
      localSkills: skills,
      serviceSkills,
      workspaceSkillBindings: workspaceSkillBindingsRuntime.bindings,
      skillsLoading: combinedSkillsLoading,
      threadItems: effectiveThreadItems,
      skillRefsEdited:
        expertSkillRefsOverride !== null ||
        expertWorkspaceSkillRuntimeEnableRefs.length > 0,
      enabledWorkspaceSkillRuntimeCount:
        expertWorkspaceSkillRuntimeEnableBindings.length,
      onSkillRefsChange: handleExpertSkillRefsChange,
      onEnableWorkspaceSkillRuntime: handleEnableExpertWorkspaceSkillRuntime,
      onExpertProfileSwitch: handleThreadExpertProfileSwitch,
      onOpenSkillsManage: _onNavigate
        ? handleOpenSkillsManageFromExpertPanel
        : undefined,
    },
    generalWorkbenchHarnessPanelBaseProps,
    harnessState,
    preferredServiceSkillResultFileTarget,
    rightSurfaceRuntime,
    runtimeWorkspaceId,
    sceneSessionId,
    onArticleMarkdownChange: handleArticleWorkspaceMarkdownChange,
    onOpenArticlePreviewArtifact: openWorkspaceArtifactInWorkbench,
    onOpenBrowserRuntimeForBrowserAssist:
      handleOpenBrowserRuntimeForBrowserAssist,
    onOpenServiceSkillResultFile: handleOpenServiceSkillResultFile,
    handleSendRef,
    restoreInput: setInput,
    setLayoutMode,
  });
  const generalWorkbenchSidebarNode =
    renderWorkspaceGeneralWorkbenchSidebarRuntime({
      contextWorkspace: contextHarnessRuntime.contextWorkspace,
      generalWorkbenchHarnessSummary:
        harnessInventoryRuntime.generalWorkbenchHarnessSummary,
      generalWorkbenchScaffoldRuntime,
      generalWorkbenchSidebarRuntime,
      harnessPanelVisible: rightSurfaceState.activeSurface === "harness",
      isThemeWorkbench,
      messages,
      projectId,
      sessionId,
      visible: showGeneralWorkbenchSidebar,
      onAddImage: handleAddImage,
      onApplyFollowUpAction: handleApplyGeneralWorkbenchFollowUpAction,
      onCreateVersionSnapshot: handleCreateVersionSnapshot,
      onDeleteTopic: handleDeleteGeneralWorkbenchVersion,
      onImportDocument: handleImportDocument,
      onRequestCollapse: handleCollapseGeneralWorkbenchSidebar,
      onSetBranchStatus: handleSetBranchStatus,
      onSwitchBranchVersion: handleSwitchBranchVersion,
      onToggleHarnessPanel: handleToggleRightSurfaceHarness,
      onViewContextDetail: handleViewContextDetail,
    });
  const { homeRecoverySession, handleResumeHomeRecoverySession } =
    useWorkspaceHomeRecoveryRuntime({
      onBackgroundSessionRuntimeChange,
      onNavigate: _onNavigate,
      onOpenTaskTopic: handleOpenTaskTopic,
      onResumeRecentSession: handleResumeRecentSession,
      projectId,
      recentSessionTopic,
    });
  const conversationSceneRuntime = useWorkspaceConversationSceneRuntime({
    messageListEmptyStateVariant: sceneMessageListEmptyStateVariant,
    navbarContextVariant:
      agentEntry === "claw" || shouldUseBrowserWorkspaceHomeChrome
        ? "task-center"
        : "default",
    navigationActions,
    inputbarScene,
    canvasScene,
    handleSendFromEmptyState,
    shellChromeRuntime,
    currentImageWorkbenchActive: currentImageWorkbenchState.active,
    browserWorkbenchOpenRequest: workbenchRequests.browserWorkbenchOpenRequest,
    onBrowserWorkbenchOpenRequestHandled:
      workbenchRequests.handleBrowserWorkbenchOpenRequestHandled,
    canvasWorkbenchPreviewOpenRequest:
      workbenchRequests.canvasWorkbenchPreviewOpenRequest,
    onCanvasWorkbenchPreviewOpenRequestHandled:
      workbenchRequests.handleCanvasWorkbenchPreviewOpenRequestHandled,
    projectId: projectId ?? null,
    openedProjects,
    onCloseProject: handleCloseOpenedProject,
    deferWorkspaceListLoad: shouldUseBrowserWorkspaceHomeChrome,
    projectRootPath: project?.rootPath || null,
    canvasWorkbenchRootPath,
    projectCharacters: projectMemory?.characters || [],
    generalCanvasContent: generalCanvasState.content,
    handleToggleHarnessPanel: handleToggleRightSurfaceHarness,
    entryBannerVisible,
    entryBannerMessage: effectiveEntryBannerMessage,
    creationReplaySurface: initialCreationReplaySurface,
    defaultCuratedTaskReferenceMemoryIds,
    defaultCuratedTaskReferenceEntries,
    pathReferences,
    onAddPathReferences: handleAddPathReferences,
    inputRestoreRequest,
    onInputRestoreRequestHandled: handleInputRestoreRequestHandled,
    onImportPathReferenceAsKnowledge:
      inputbarScene.onImportPathReferenceAsKnowledge,
    onRemovePathReference: handleRemovePathReference,
    onClearPathReferences: handleClearPathReferences,
    fileManagerOpen: fileManagerSidebar.fileManagerOpen,
    onToggleFileManager: fileManagerSidebar.fileManagerAvailable
      ? fileManagerSidebar.toggleFileManagerSidebar
      : undefined,
    sceneAppExecutionSummaryCard,
    pluginHistoryRestoreLandingCard: workspacePluginHistoryRestoreLandingCard,
    serviceSkillExecutionCard,
    contextWorkspaceEnabled: contextWorkspace.generalWorkbenchEnabled,
    pluginSuggestions: workspacePluginInputSuggestions,
    pluginSuggestionsError:
      workspacePluginRuntimeContext.error?.message ?? null,
    pluginSuggestionsLoading: workspacePluginRuntimeContext.loading,
    onPluginSuggestionsNeeded: handlePluginSuggestionsNeeded,
    input,
    setInput,
    emptyStateSendOnPointerDown: true,
    providerType,
    setProviderType,
    model,
    setModel,
    reasoningEffort,
    setReasoningEffort,
    accessMode,
    setAccessMode,
    chatToolPreferences: effectiveChatToolPreferences,
    setChatToolPreferences,
    objectiveEnabled: inputbarObjectiveModeEnabled,
    onObjectiveEnabledChange: setInputbarObjectiveModeEnabled,
    selectedTeam,
    creationMode,
    setCreationMode,
    activeTheme,
    setActiveTheme,
    lockTheme,
    artifacts,
    resolvedCanvasState,
    contentId,
    selectedText,
    handleRecommendationClick,
    skills,
    serviceSkills: activeTheme === "general" ? serviceSkills : [],
    serviceSkillGroups: activeTheme === "general" ? serviceSkillGroups : [],
    skillsLoading: combinedSkillsLoading,
    onSelectServiceSkill:
      workspaceServiceSkillEntryActions.handleServiceSkillSelect,
    handleNavigateToSkillSettings,
    handleRefreshSkills,
    handleOpenBrowserAssistInCanvas: handleOpenBrowserRuntimeForBrowserAssist,
    browserAssistLaunching,
    recentSessionTitle: recentSessionTopic?.title ?? null,
    recentSessionSummary: recentSessionTopic?.lastPreview ?? null,
    recentSessionActionLabel,
    homeRecoverySession,
    handleResumeRecentSession: handleResumeHomeRecoverySession,
    projectConversationGroups,
    handleOpenProjectConversation,
    taskCenterTabsNode: shouldRenderTaskCenterTabStrip
      ? taskCenterTabsNode
      : browserWorkspaceHomeTabsNode,
    suppressNavbarUtilityActions: suppressHomeNavbarUtilityActions,
    topBarChrome,
    onBackToProjectManagement,
    fromResources,
    handleBackHome,
    rightSurfaceContent,
    rightSurfaceLaunchers,
    rightSurfaceObjectCanvasOpen:
      rightSurfaceState.activeSurface === "objectCanvas",
    onToggleRightSurfaceObjectCanvas: handleToggleRightSurfaceObjectCanvas,
    rightSurfaceBrowserOpen: rightSurfaceState.activeSurface === "browser",
    onToggleRightSurfaceBrowser: handleToggleRightSurfaceBrowser,
    rightSurfaceFilesOpen: rightSurfaceState.activeSurface === "files",
    onToggleRightSurfaceFiles: handleToggleRightSurfaceFiles,
    rightSurfaceTraceOpen: rightSurfaceState.activeSurface === "trace",
    onToggleRightSurfaceTrace: handleToggleRightSurfaceTrace,
    rightSurfaceShellOpen: rightSurfaceState.activeSurface === "shell",
    onToggleRightSurfaceShell: handleToggleRightSurfaceShell,
    showHarnessToggle: !suppressHomeNavbarUtilityActions && showHarnessToggle,
    navbarHarnessPanelVisible:
      !suppressHomeNavbarUtilityActions &&
      rightSurfaceState.activeSurface === "harness",
    showExpertInfoToggle: hasExpertInfoPanel,
    expertInfoPanelVisible,
    handleToggleExpertInfoPanel,
    harnessPendingCount: suppressHomeNavbarUtilityActions
      ? 0
      : harnessPendingCount,
    harnessAttentionLevel: suppressHomeNavbarUtilityActions
      ? "idle"
      : harnessAttentionLevel,
    harnessToggleLabel: suppressHomeNavbarUtilityActions
      ? undefined
      : harnessToggleLabel,
    isRestoringSession: sceneIsRestoringSession,
    sessionId: sceneSessionId,
    syncStatus,
    pendingA2UIForm: effectivePendingA2UIForm,
    pendingA2UISource: effectivePendingA2UISource,
    a2uiSubmissionNotice,
    handlePendingA2UISubmit,
    handleToggleCanvas: handleToggleCanvasFromRightSurface,
    hideInlineStepProgress,
    isSpecializedThemeMode,
    hasMessages,
    steps: EMPTY_WORKSPACE_WORKFLOW_STEPS,
    activityLogs: generalWorkbenchSidebarRuntime.generalWorkbenchActivityLogs,
    creationTaskEvents:
      generalWorkbenchScaffoldRuntime.generalWorkbenchCreationTaskEvents,
    currentStepIndex: HIDDEN_WORKSPACE_WORKFLOW_STEP_INDEX,
    goToStep: ignoreHiddenWorkspaceWorkflowStepClick,
    displayMessages: sceneDisplayMessagesWithArticleWorkspaceArtifact,
    turns: sceneTurns,
    effectiveThreadItems: sceneThreadItems,
    todoItems,
    currentTurnId: sceneCurrentTurnId,
    threadRead: sceneThreadRead,
    executionRuntime: sceneExecutionRuntime,
    pendingActions: scenePendingActions,
    submittedActionsInFlight: sceneSubmittedActionsInFlight,
    queuedTurns: sceneQueuedTurns,
    sessionHistoryWindow,
    loadFullSessionHistory: () => {
      void loadFullSessionHistory();
    },
    isPreparingSend: sceneIsPreparingSend,
    isSending: sceneIsSending,
    stopSending,
    resumeThread,
    replayPendingAction,
    promoteQueuedTurn,
    deleteMessage,
    editMessage,
    handleA2UISubmit: handleMessageA2UISubmit,
    handleWriteFile,
    handleFileClick: handleWorkspaceFileClick,
    handleOpenArtifactFromTimeline,
    handleOpenSavedSiteContent,
    handleArtifactClick: handleWorkspaceArtifactClick,
    handleOpenUrlPreview,
    handleOpenMessagePreview,
    handleSaveMessageAsSkill,
    handleSaveMessageAsKnowledge,
    handleOpenSubagentSession,
    handlePermissionResponse,
    onRefreshSessionReadModel: () =>
      refreshSessionReadModel(sceneSessionId || undefined),
    pendingPromotedA2UIActionRequest,
    shouldCollapseCodeBlocks,
    shouldCollapseCodeBlockInChat,
    handleCodeBlockClick,
    layoutMode: sceneLayoutMode,
    isThemeWorkbench,
    settledWorkbenchArtifacts,
    taskFiles,
    selectedFileId,
    handleHarnessLoadFilePreview,
    setCanvasWorkbenchLayoutMode,
    workspacePathMissing: Boolean(workspacePathMissing),
    workspaceHealthError,
    focusedTimelineItemId: workbenchRequests.focusedTimelineItemId,
    timelineFocusRequestKey: workbenchRequests.timelineFocusRequestKey,
  });

  const fileManagerNode = renderWorkspaceFileManagerSidebarRuntime({
    fileManagerSidebar,
    initialDirectory: project?.rootPath || null,
    onAddPathReferences: handleAddPathReferences,
    onImportAsKnowledge: inputbarScene.onImportPathReferenceAsKnowledge,
    onInstallSkillPackage: _onNavigate
      ? handleInstallSkillPackageFromFileManager
      : undefined,
    onOpenWorkspaceFile: (absolutePath) => {
      void openProjectFilePreviewInCanvas({
        absolutePath,
      });
    },
  });
  return (
    <>
      <WorkspaceShellScene
        compactChrome={shellChromeRuntime.isWorkspaceCompactChrome}
        isThemeWorkbench={isThemeWorkbench}
        generalWorkbenchSidebarNode={generalWorkbenchSidebarNode}
        showGeneralWorkbenchLeftExpandButton={
          showGeneralWorkbenchLeftExpandButton
        }
        onExpandGeneralWorkbenchSidebar={handleExpandGeneralWorkbenchSidebar}
        fileManagerNode={fileManagerNode}
        mainAreaNode={conversationSceneRuntime.mainAreaNode}
      />
      <AutomationJobDialog
        open={workspaceServiceSkillEntryActions.automationDialogOpen}
        mode="create"
        workspaces={workspaceServiceSkillEntryActions.automationWorkspaces}
        initialValues={
          workspaceServiceSkillEntryActions.automationDialogInitialValues
        }
        threadLineage={
          workspaceServiceSkillEntryActions.automationThreadLineage
        }
        saving={workspaceServiceSkillEntryActions.automationJobSaving}
        onOpenChange={
          workspaceServiceSkillEntryActions.handleAutomationDialogOpenChange
        }
        onSubmit={
          workspaceServiceSkillEntryActions.handleAutomationDialogSubmit
        }
      />
      {sceneAppReviewDecisionDialogNode}
    </>
  );
}
