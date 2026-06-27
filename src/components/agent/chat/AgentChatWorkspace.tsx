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
import { useFileManagerSidebar } from "./hooks/useFileManagerSidebar";
import { useBrowserWorkspaceHomeHint } from "./hooks/useBrowserWorkspaceHomeHint";
import { usePathReferences } from "./hooks/usePathReferences";
import { useWorkspaceWorkbenchRequests } from "./hooks/useWorkspaceWorkbenchRequests";
import { useSessionFiles } from "./hooks/useSessionFiles";
import { useContentSync } from "./hooks/useContentSync";
import { useDeveloperFeatureFlags } from "@/hooks/useDeveloperFeatureFlags";
import { useGlobalMediaGenerationDefaults } from "@/hooks/useGlobalMediaGenerationDefaults";
import { useServiceModelsConfig } from "@/hooks/useServiceModelsConfig";
import { useSoulArtifactVoiceGenerationBrief } from "@/hooks/useSoulArtifactVoiceGenerationBrief";
import { useTrayModelShortcuts } from "./hooks/useTrayModelShortcuts";
import { SettingsTabs } from "@/types/settings";
import { type CanvasWorkbenchLayoutMode } from "./components/CanvasWorkbenchLayout";
import { TaskCenterShellPanel } from "./components/TaskCenterShellPanel";
import type { CreationMode } from "./components/types";
import { type TaskFile } from "./components/TaskFiles";
import { useWorkflow } from "@/components/workspace/hooks/useWorkflow";
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
import {
  cancelMediaTaskArtifact,
  createImageGenerationTaskArtifact,
  getMediaTaskArtifact,
} from "@/lib/api/mediaTasks";
import { updateAgentRuntimeSession } from "@/lib/api/agentRuntime";
import { type Character } from "@/lib/api/projectMemory";
import { useImageGen } from "@/components/image-gen/useImageGen";
import { resolveMediaGenerationPreference } from "@/lib/mediaGeneration";
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
import { deriveHarnessSessionState } from "./utils/harnessState";
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
import { useLimeSkills } from "./hooks/useLimeSkills";
import { useServiceSkills } from "./service-skills/useServiceSkills";
import { useWorkspaceProjectSelection } from "./hooks/useWorkspaceProjectSelection";
import { useRuntimeTeamFormation } from "./hooks/useRuntimeTeamFormation";
import { mergeThreadItems } from "./utils/threadTimelineView";
import { openCanvasForReason } from "./workspace/canvasOpenPolicy";
import { useWorkbenchStore } from "@/stores/useWorkbenchStore";
import {
  asRecord,
  GENERAL_BROWSER_ASSIST_ARTIFACT_ID,
} from "./workspace/browserAssistArtifact";
import { SceneAppExecutionSummaryCard } from "./workspace/SceneAppExecutionSummaryCard";
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
import { useTaskCenterTabSessionRuntime } from "./workspace/useTaskCenterTabSessionRuntime";
import {
  useTaskCenterDraftSendDispatchRuntime,
  useTaskCenterEmptyStateSendRuntime,
  useTaskCenterHomePendingPreviewRuntime,
} from "./workspace/useTaskCenterDraftSendRuntime";
import { useTaskCenterChromeNavigationRuntime } from "./workspace/useTaskCenterChromeNavigationRuntime";
import { useTaskCenterDraftMaterializationRuntime } from "./workspace/useTaskCenterDraftMaterializationRuntime";
import { useTaskCenterTopicNavigationRuntime } from "./workspace/useTaskCenterTopicNavigationRuntime";
import { useWorkspaceCanvasTaskFileSync } from "./workspace/useWorkspaceCanvasTaskFileSync";
import { useWorkspaceGeneralResourceSync } from "./workspace/useWorkspaceGeneralResourceSync";
import { useWorkspaceArtifactWorkbenchActions } from "./workspace/useWorkspaceArtifactWorkbenchActions";
import { useSceneAppExecutionSummaryRuntime } from "./workspace/useSceneAppExecutionSummaryRuntime";
import {
  buildSceneAppExecutionContentPostEntries,
  type SceneAppExecutionContentPostEntry,
} from "./workspace/sceneAppExecutionContentPosts";
import {
  useWorkspaceImageWorkbenchActionRuntime,
  type SubmitImageWorkbenchAgentCommandParams,
} from "./workspace/useWorkspaceImageWorkbenchActionRuntime";
import { useWorkspaceImageWorkbenchSessionRuntime } from "./workspace/useWorkspaceImageWorkbenchSessionRuntime";
import { useWorkspaceImageWorkbenchEventRuntime } from "./workspace/useWorkspaceImageWorkbenchEventRuntime";
import { buildImageSkillLaunchRequestMetadata } from "./workspace/imageSkillLaunch";
import { useWorkspaceImageTaskPreviewRuntime } from "./workspace/useWorkspaceImageTaskPreviewRuntime";
import { useWorkspaceAudioTaskPreviewRuntime } from "./workspace/useWorkspaceAudioTaskPreviewRuntime";
import { useWorkspaceTranscriptionTaskPreviewRuntime } from "./workspace/useWorkspaceTranscriptionTaskPreviewRuntime";
import { useWorkspaceVideoTaskPreviewRuntime } from "./workspace/useWorkspaceVideoTaskPreviewRuntime";
import { useWorkspaceVideoTaskActionRuntime } from "./workspace/useWorkspaceVideoTaskActionRuntime";
import { useWorkspaceSessionRestore } from "./workspace/useWorkspaceSessionRestore";
import { useWorkspaceResetRuntime } from "./workspace/useWorkspaceResetRuntime";
import { useWorkspaceSendActions } from "./workspace/useWorkspaceSendActions";
import { useWorkspacePluginRuntimeContext } from "./workspace/useWorkspacePluginRuntimeContext";
import { buildWorkspacePluginInputSuggestions } from "./workspace/workspacePluginInputSuggestions";
import { buildWorkspacePluginHistoryRestoreProjection } from "./workspace/workspacePluginHistoryRestoreRuntime";
import { WorkspacePluginHistoryRestoreLandingCard } from "./workspace/WorkspacePluginHistoryRestoreLandingCard";
import { buildWorkspacePluginHistoryRestoreLandingModel } from "./workspace/workspacePluginHistoryRestoreLanding";
import {
  buildWorkspacePluginHistoryRestoreArtifactPreviewArtifact,
  buildWorkspacePluginHistoryRestoreArtifactPreviewItems,
  type WorkspacePluginHistoryRestoreArtifactPreviewItem,
} from "./workspace/workspacePluginHistoryRestoreArtifacts";
import { buildWorkspacePluginProductProfileFromActivation } from "./workspace/workspacePluginProductProfile";
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
import {
  buildPlanImplementationHarnessMetadata,
  selectProposedPlanImplementationDecision,
} from "./workspace/planImplementationDecision";
import { useWorkspaceGeneralWorkbenchSidebarRuntime } from "./workspace/useWorkspaceGeneralWorkbenchSidebarRuntime";
import { useWorkspaceGeneralWorkbenchRuntime } from "./workspace/useWorkspaceGeneralWorkbenchRuntime";
import { useWorkspaceTeamSessionRuntime } from "./workspace/useWorkspaceTeamSessionRuntime";
import { useWorkspaceGeneralWorkbenchDocumentPersistenceRuntime } from "./workspace/useWorkspaceGeneralWorkbenchDocumentPersistenceRuntime";
import { useWorkspaceServiceSkillEntryActions } from "./workspace/useWorkspaceServiceSkillEntryActions";
import { useWorkspaceArtifactViewModeControl } from "./workspace/useWorkspaceArtifactViewModeControl";
import { useWorkspaceInitialSessionNavigation } from "./workspace/useWorkspaceInitialSessionNavigation";
import { useSceneAppReviewDecisionRuntime } from "./workspace/useSceneAppReviewDecisionRuntime";
import { resolveImageWorkbenchPreferenceViewModel } from "./workspace/imageWorkbenchPreference";
import { useWorkspaceOpenedProjectsRuntime } from "./workspace/useWorkspaceOpenedProjectsRuntime";
import { useWorkspaceProjectContentRuntime } from "./workspace/useWorkspaceProjectContentRuntime";
import { useWorkspaceHealthRuntime } from "./workspace/useWorkspaceHealthRuntime";
import { useWorkspaceDefaultProjectAliasRuntime } from "./workspace/useWorkspaceDefaultProjectAliasRuntime";
import { WorkspaceGeneralWorkbenchSidebar } from "./workspace/WorkspaceGeneralWorkbenchSidebar";
import { GeneralWorkbenchHarnessSurfaceSection } from "./workspace/WorkspaceHarnessDialogs";
import {
  WorkspaceFilesSurface,
  type WorkspaceFilesSurfaceTarget,
} from "./workspace/WorkspaceFilesSurface";
import { WorkspaceAgentAppSurface } from "./workspace/WorkspaceAgentAppSurface";
import {
  closeWorkspaceAgentAppSurfaceDescriptor,
  mergeWorkspaceAgentAppSurfaceDescriptors,
  resolveWorkspaceAgentAppSurfaceActiveContainerId,
  selectWorkspaceAgentAppSurfaceDescriptor,
  type WorkspaceAgentAppSurfaceDescriptor,
} from "./workspace/workspaceAgentAppSurfaceModel";
import { WorkspaceObjectCanvasSurface } from "./workspace/WorkspaceObjectCanvasSurface";
import type { WorkspaceObjectCanvasCandidate } from "./workspace/workspaceObjectCanvasModel";
import { WorkspaceProductProfileSurface } from "./workspace/WorkspaceProductProfileSurface";
import { submitWorkspaceProductProfileActionIntent } from "./workspace/workspaceProductProfileActionDispatch";
import {
  buildWorkspaceProductProfileFromThreadRead,
  type WorkspaceProductProfileActionIntent,
  type WorkspaceProductProfile,
} from "./workspace/workspaceProductProfileModel";
import {
  buildWorkspaceProductProfileSelectionUpdateRequest,
  type WorkspaceProductProfileSelectionChange,
} from "./workspace/workspaceProductProfileSelectionWriteback";
import { WorkspaceShellScene } from "./workspace/WorkspaceShellScene";
import {
  buildWorkspaceRightSurfaceDefinitions,
  RightSurfaceHost,
  resolveExpertInfoPanelCollapsedAfterLayoutChange,
  resolveWorkspaceRightSurfaceState,
  type WorkspaceRightSurfaceKind,
} from "./workspace/right-surface";
import { RightSurfaceBrowserPanel } from "./workspace/right-surface/browser/RightSurfaceBrowserPanel";
import { ExpertInfoPanel } from "./experts/ExpertInfoPanel";
import { FileManagerSidebar } from "./components/FileManager/FileManagerSidebar";
import type { GeneralWorkbenchFollowUpActionPayload } from "./components/generalWorkbenchSidebarContract";
import { RuntimeReviewDecisionDialog } from "./components/RuntimeReviewDecisionDialog";
import { hasNamedGeneralCanvasFilePreview } from "./workspace/generalCanvasPreviewState";
import { resolvePreferredServiceSkillResultFileTarget } from "./workspace/serviceSkillResultFileTarget";
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
import { buildImageWorkbenchPreviewResourceManagerInput } from "./workspace/imageWorkbenchResourceManager";
import { openResourceManager } from "@/features/resource-manager";
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
  extractCuratedTaskReferenceMemoryIds,
  mergeCuratedTaskReferenceEntries,
  normalizeCuratedTaskReferenceMemoryIds,
} from "./utils/curatedTaskReferenceSelection";
import {
  buildRuntimeInitialInputCapabilityFromFollowUpAction,
  resolveEffectiveInitialInputCapability,
} from "./utils/inputCapabilityBootstrap";
import { buildKnowledgeSavePageParams } from "./workspace/knowledge/knowledgeSaveNavigation";
import {
  buildSceneAppExecutionCuratedTaskFollowUpAction,
  buildCuratedTaskReferenceEntryFromSceneAppExecution,
  buildSceneAppExecutionReviewFollowUpAction,
} from "./utils/sceneAppCuratedTaskReference";
import { buildSkillsPageParamsFromMessage } from "./utils/skillScaffoldDraft";
import { resolveAgentChatWorkspaceShellViewModel } from "./agentChatWorkspaceShellViewModel";
import { resolveTaskCenterDraftSurfaceState } from "./workspace/taskCenterSurfaceState";
import { AutomationJobDialog } from "@/components/settings-v2/system/automation/AutomationJobDialog";
import { resolveWorkspaceShellChromeRuntime } from "./workspace/workspaceShellChromeRuntime";
import { resolveWorkspaceEntryLoadDeferral } from "./workspace/workspaceEntryLoadDeferral";
import { resolveWorkspaceSceneSessionProjection } from "./workspace/workspaceSceneSessionProjection";
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
import {
  buildWorkspaceRightSurfaceRuntimeLaunchers,
  buildWorkspaceRightSurfaceRuntimePendingIntents,
} from "./workspace/workspaceRightSurfaceRuntimeProjection";
import { useWorkspaceRightSurfacePendingRuntime } from "./workspace/useWorkspaceRightSurfacePendingRuntime";
import type { WorkspaceRightSurfaceBrowserIntent } from "./workspace/workspaceRightSurfaceBrowserIntent";
import { buildBrowserSessionRefFromBrowserAssistSessionState } from "./workspace/workspaceBrowserSessionRef";
import {
  createRestoredInteractiveMessageSnapshot,
  resolveReadOnlyInteractiveMessageIds,
} from "./workspace/workspaceRestoredInteractiveMessages";
import { useWorkspaceWorkflowProgressRuntime } from "./workspace/useWorkspaceWorkflowProgressRuntime";
import { useWorkspaceDebugRuntime } from "./workspace/useWorkspaceDebugRuntime";
import { useWorkspaceClassicClawSidebarRuntime } from "./workspace/useWorkspaceClassicClawSidebarRuntime";
import { useWorkspaceChatToolPreferencesRuntime } from "./workspace/useWorkspaceChatToolPreferencesRuntime";
import { useWorkspaceExpertAgentLaunchSyncRuntime } from "./workspace/useWorkspaceExpertAgentLaunchSyncRuntime";
import {
  useWorkspaceArtifactStoreRuntime,
  useWorkspaceGeneralArtifactUpsert,
} from "./workspace/useWorkspaceArtifactStoreRuntime";
import {
  useWorkspaceActiveContentTargetRuntime,
  useWorkspaceEntryStateRuntime,
  useWorkspaceServiceSkillDirectoryToastRuntime,
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
  BROWSER_WORKSPACE_HOME_HINT_MESSAGE,
  GENERAL_BROWSER_ASSIST_PROFILE_KEY,
  NOOP_SET_CHAT_MESSAGES,
  isUsableKnowledgeSourceText,
  normalizeVideoAspectRatio,
  normalizeVideoResolution,
  resolveDefaultSelectedArtifact,
  resolveRuntimeWorkspaceId,
  resolveTaskPreviewArtifact,
  resolveVideoCanvasStatusFromPreview,
  type TaskCenterDraftTab,
} from "./workspace/agentChatWorkspaceHelpers";
import { SCENEAPP_QUICK_REVIEW_ACTIONS } from "@/lib/agent/legacySceneAppExecutionSummary";

export type {
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
    browserWorkspaceHintVisible,
    dismissBrowserWorkspaceHint: handleDismissBrowserWorkspaceHint,
  } = useBrowserWorkspaceHomeHint({
    enabled: shouldUseBrowserWorkspaceHomeChrome,
    projectId: projectId ?? null,
    entryBannerMessage,
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
  const [taskFilesExpanded, setTaskFilesExpanded] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>();
  const taskFilesRef = useRef<TaskFile[]>([]);
  const socialStageLogRef = useRef<Record<string, string>>({});

  const { openedProjects, handleCloseOpenedProject } =
    useWorkspaceOpenedProjectsRuntime({
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
    validatedRuntimeProjectId,
  );
  const { clawTraceEnabled, workspaceHarnessEnabled } =
    useDeveloperFeatureFlags();
  const { mediaDefaults, loading: mediaDefaultsLoading } =
    useGlobalMediaGenerationDefaults();
  const { serviceModels, agentResponseLanguage } = useServiceModelsConfig();
  const { generationBrief: soulArtifactVoiceGenerationBrief } =
    useSoulArtifactVoiceGenerationBrief();
  const [soulArtifactVoiceEnabledForTurn, setSoulArtifactVoiceEnabledForTurn] =
    useState(true);
  useWorkspaceSoulArtifactVoiceTurnRuntime({
    generationBrief: soulArtifactVoiceGenerationBrief,
    setSoulArtifactVoiceEnabledForTurn,
  });
  const inputCompletionEnabled =
    serviceModels.input_completion?.enabled !== false;
  const effectiveImageWorkbenchPreference = useMemo(
    () =>
      resolveMediaGenerationPreference(
        project?.settings?.imageGeneration,
        mediaDefaults.image,
      ),
    [mediaDefaults.image, project?.settings?.imageGeneration],
  );

  const imageWorkbenchGenerationRuntime = useImageGen({
    preferredProviderId: effectiveImageWorkbenchPreference.preferredProviderId,
    preferredModelId: effectiveImageWorkbenchPreference.preferredModelId,
    allowFallback: effectiveImageWorkbenchPreference.allowFallback,
    providerLoadMode: shouldDeferWorkspaceAuxiliaryLoads
      ? "deferred"
      : "immediate",
    providerDeferredDelayMs: deferredWorkspaceAuxiliaryLoadMs,
    selectionScopeKey: `${externalProjectId ?? project?.id ?? "no-project"}:${initialSessionId ?? "no-session"}:${contentId ?? "no-content"}`,
  });
  const {
    availableProviders: imageWorkbenchProviders,
    selectedProvider: imageWorkbenchSelectedProvider,
    selectedProviderId: imageWorkbenchSelectedProviderId,
    setSelectedProviderId: setImageWorkbenchSelectedProviderId,
    selectedModel: imageWorkbenchSelectedModel,
    selectedModelId: imageWorkbenchSelectedModelId,
    setSelectedModelId: setImageWorkbenchSelectedModelId,
    selectedSize: imageWorkbenchSelectedSize,
    setSelectedSize: setImageWorkbenchSelectedSize,
    preferredProviderUnavailable: imageWorkbenchPreferredProviderUnavailable,
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
        providersLoading: imageWorkbenchGenerationRuntime.providersLoading,
      }),
    [
      effectiveImageWorkbenchPreference,
      imageWorkbenchGenerationRuntime.providersLoading,
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

  useWorkspaceTaskFilesRefSyncRuntime({
    taskFiles,
    taskFilesRef,
  });

  // 引用的角色列表（用于注入到消息中）
  const [mentionedCharacters, setMentionedCharacters] = useState<Character[]>(
    [],
  );

  // 技能列表（用于 @ 引用）
  const {
    skills,
    skillsLoading,
    refreshSkills: loadSkills,
  } = useLimeSkills({
    autoLoad: shouldDeferWorkspaceAuxiliaryLoads ? "deferred" : "immediate",
    deferredDelayMs: deferredWorkspaceAuxiliaryLoadMs,
    logScope: "AgentChatPage",
    onError: (error) => {
      console.warn("[AgentChatPage] 加载 skills 失败:", error);
    },
  });
  const {
    skills: serviceSkills,
    groups: serviceSkillGroups,
    isLoading: serviceSkillsLoading,
    error: serviceSkillsError,
    recordUsage: recordServiceSkillUsage,
  } = useServiceSkills({
    enabled: activeTheme === "general",
    loadMode: shouldDeferWorkspaceAuxiliaryLoads ? "deferred" : "immediate",
    deferredDelayMs: deferredWorkspaceAuxiliaryLoadMs,
  });

  useWorkspaceServiceSkillDirectoryToastRuntime({
    activeTheme,
    serviceSkillsError,
  });

  const initialAutoSendAllowsDetachedSession = useMemo(
    () => shouldAllowDetachedInitialAutoSend(initialAutoSendRequestMetadata),
    [initialAutoSendRequestMetadata],
  );
  const initialPendingServiceSkillLaunchSignature = useMemo(
    () =>
      buildPendingServiceSkillLaunchSignature(initialPendingServiceSkillLaunch),
    [initialPendingServiceSkillLaunch],
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

  // 工作流状态（仅在内容创作模式下使用）
  const mappedTheme = activeTheme as ThemeType;
  const { steps, currentStepIndex, goToStep, completeStep } = useWorkflow(
    mappedTheme,
    creationMode,
  );

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
  const handleRefreshSkills = useCallback(async () => {
    await loadSkills(true);
  }, [loadSkills]);

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
    clawTraceEnabled,
  });
  const { workspaceHealthError, setWorkspaceHealthError } =
    useWorkspaceHealthRuntime({
      project,
      projectId,
      workspacePathMissing,
      shouldDeferWorkspaceAuxiliaryLoads,
      deferredWorkspaceAuxiliaryLoadMs,
    });
  const activeSessionKey = sessionId?.trim() || null;
  const sessionExpertRequestMetadata = useMemo(
    () => resolveSessionExpertRequestMetadata(threadRead),
    [threadRead],
  );
  const expertPanelRequestMetadata = useMemo(
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
      expertAgentLaunch,
      expertPanelRequestMetadata,
      pruneWorkspaceSkillRuntimeEnableRefs:
        pruneExpertWorkspaceSkillRuntimeEnableRefs,
      sessionId,
    });
  const workspaceRequestMetadataWithExpertSkills = useMemo(
    () =>
      resolveWorkspaceRequestMetadataWithExpertSkills({
        expertSkillRefsOverride,
        initialAutoSendRequestMetadata,
        initialRequestMetadata,
        sessionRequestMetadata: sessionExpertRequestMetadata,
      }),
    [
      expertSkillRefsOverride,
      initialAutoSendRequestMetadata,
      initialRequestMetadata,
      sessionExpertRequestMetadata,
    ],
  );
  const workspacePluginRuntimeContext = useWorkspacePluginRuntimeContext({
    requestMetadata: workspaceRequestMetadataWithExpertSkills,
    preloadInstalled: true,
  });
  const workspacePluginInputSuggestions = useMemo(
    () =>
      buildWorkspacePluginInputSuggestions(
        workspacePluginRuntimeContext.context,
      ),
    [workspacePluginRuntimeContext.context],
  );
  const workspacePluginHistoryRestoreProjection = useMemo(
    () =>
      buildWorkspacePluginHistoryRestoreProjection({
        threadRead,
        contracts: workspacePluginRuntimeContext.context.contracts,
        registryItems: workspacePluginRuntimeContext.context.registry,
      }),
    [
      threadRead,
      workspacePluginRuntimeContext.context.contracts,
      workspacePluginRuntimeContext.context.registry,
    ],
  );
  const workspacePluginHistoryRestoreLandingModel = useMemo(
    () =>
      buildWorkspacePluginHistoryRestoreLandingModel({
        projection: workspacePluginHistoryRestoreProjection,
        contracts: workspacePluginRuntimeContext.context.contracts,
      }),
    [
      workspacePluginHistoryRestoreProjection,
      workspacePluginRuntimeContext.context.contracts,
    ],
  );
  const workspacePluginHistoryRestoreArtifactPreviewItems = useMemo(
    () =>
      buildWorkspacePluginHistoryRestoreArtifactPreviewItems({
        projection: workspacePluginHistoryRestoreProjection,
        maxItems: 3,
      }),
    [workspacePluginHistoryRestoreProjection],
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
  const teamSessionRuntime = useWorkspaceTeamSessionRuntime({
    sessionId,
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
  const realSubagentTimelineItems = useMemo(
    () =>
      buildRealSubagentTimelineItems({
        threadId: sessionId,
        turns,
        childSessions: childSubagentSessions,
      }),
    [childSubagentSessions, sessionId, turns],
  );
  const effectiveThreadItems = useMemo(
    () => mergeThreadItems(threadItems, realSubagentTimelineItems),
    [realSubagentTimelineItems, threadItems],
  );
  const harnessState = useMemo(
    () =>
      deriveHarnessSessionState(
        messages,
        pendingActions,
        effectiveThreadItems,
        todoItems,
      ),
    [effectiveThreadItems, messages, pendingActions, todoItems],
  );
  useEffect(() => {
    onSessionChange?.(sessionId ?? null);
  }, [onSessionChange, sessionId]);

  const contextHarnessRuntime = useWorkspaceContextHarnessRuntime({
    enabled: workspaceHarnessEnabled || generalHarnessEntryEnabled,
    projectId,
    activeTheme,
    messages,
    providerType,
    model,
    mappedTheme,
    isSending,
    projectMemory,
    harnessState,
  });
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
  const effectivePendingA2UIForm =
    pendingServiceSkillLaunchForm ?? pendingSceneGateForm ?? pendingA2UIForm;
  const effectivePendingA2UISource =
    pendingServiceSkillLaunchSource ??
    pendingSceneGateSource ??
    pendingA2UISource;
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

  const generalWorkbenchSidebarRuntime =
    useWorkspaceGeneralWorkbenchSidebarRuntime({
      isThemeWorkbench,
      sessionId,
      messages,
      isSending,
      themeWorkbenchBackendRunState,
      contextActivityLogs: contextWorkspace.activityLogs,
      historyPageSize: GENERAL_WORKBENCH_HISTORY_PAGE_SIZE,
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
    harnessPanelVisible,
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
    autoInit: true,
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
  const [taskCenterDraftSendRequest, setTaskCenterDraftSendRequest] =
    useState<TaskCenterDraftSendRequest | null>(null);
  const [homePendingPreviewRequest, setHomePendingPreviewRequest] =
    useState<TaskCenterDraftSendRequest | null>(null);
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
  useWorkspaceInitialSessionNavigation({
    initialSessionId,
    currentSessionId: sessionId,
    resolveInitialSessionSwitch,
    shouldHydrateMatchedInitialSession:
      isAutoRestoringSession || isSessionHydrating,
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
    deferInitialSync: false,
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
    projectId,
    projectRootPath: project?.rootPath || null,
    saveImageWorkbenchImagesToResource,
    submitImageWorkbenchAgentCommand: async (params) =>
      (await submitImageWorkbenchAgentCommandRef.current?.(params)) ?? false,
    setCanvasState,
    setInput,
    updateCurrentImageWorkbenchState,
  });
  const { handleImageWorkbenchCommand, resolveImageWorkbenchSkillRequest } =
    imageWorkbenchActionRuntime;
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
    serviceModels,
    agentResponseLanguage,
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
    resolveImageWorkbenchSkillRequest,
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
          requestMetadata: buildImageSkillLaunchRequestMetadata(
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
    hasPendingA2UIForm,
    isPreparingSend,
    isSending,
    queuedTurnCount: queuedTurns.length,
  });
  const { homePendingPreviewMessages, isHomePendingPreviewActive } =
    useTaskCenterHomePendingPreviewRuntime({
      homePendingPreviewRequest,
      shouldSuppressTaskCenterDraftContent,
      displayMessagesLength: displayMessages.length,
      executionStrategy,
      workspaceId: taskCenterWorkspaceId,
    });

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
    isSessionHydrating,
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
    currentStepIndex,
    isSpecializedThemeMode,
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
    completeStep,
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
  const { renderToolbarActions: renderArtifactWorkbenchToolbarActions } =
    useWorkspaceArtifactWorkbenchActions({
      activeTheme,
      projectId,
      syncGeneralArtifactToResource,
      onSaveArtifactDocument: handleSaveArtifactDocument,
    });

  const {
    handleHarnessLoadFilePreview,
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
  const handleWorkspaceArtifactClick = useCallback(
    (artifact: Artifact) => {
      workbenchRequests.clearFocusedArtifactBlock();
      handleArtifactClick(artifact);
    },
    [handleArtifactClick, workbenchRequests],
  );
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
        const resourceManagerInput =
          buildImageWorkbenchPreviewResourceManagerInput({
            message,
            preview: target.preview,
            selection: target.selection,
            threadId: sessionId ?? null,
          });

        if (resourceManagerInput) {
          void openResourceManager(resourceManagerInput);
          return;
        }

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
      messages,
      sessionId,
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
      currentTurnId
        ? effectiveThreadItems.filter((item) => item.turn_id === currentTurnId)
        : [],
    [currentTurnId, effectiveThreadItems],
  );
  const preferredServiceSkillResultFileTarget = useMemo(
    () =>
      resolvePreferredServiceSkillResultFileTarget({
        threadItems: currentTurnThreadItems,
        savedContentTarget: siteSkillSavedContentTarget,
      }),
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
  const sceneAppExecutionSummaryState = useSceneAppExecutionSummaryRuntime({
    initialSummary: initialSceneAppExecutionSummary,
    sessionId,
    isSending,
  });
  const sceneAppExecutionReferenceEntry = useMemo(
    () =>
      buildCuratedTaskReferenceEntryFromSceneAppExecution({
        summary: sceneAppExecutionSummaryState?.summary,
      }),
    [sceneAppExecutionSummaryState?.summary],
  );
  const defaultCuratedTaskReferenceEntries = useMemo(
    () =>
      mergeCuratedTaskReferenceEntries([
        ...(initialCreationReplaySurface?.defaultReferenceEntries ?? []),
        sceneAppExecutionReferenceEntry,
      ]).slice(0, 3),
    [
      initialCreationReplaySurface?.defaultReferenceEntries,
      sceneAppExecutionReferenceEntry,
    ],
  );
  const defaultCuratedTaskReferenceMemoryIds = useMemo(
    () =>
      normalizeCuratedTaskReferenceMemoryIds([
        ...(initialCreationReplaySurface?.defaultReferenceMemoryIds ?? []),
        ...(extractCuratedTaskReferenceMemoryIds(
          defaultCuratedTaskReferenceEntries,
        ) ?? []),
      ]) ?? [],
    [
      defaultCuratedTaskReferenceEntries,
      initialCreationReplaySurface?.defaultReferenceMemoryIds,
    ],
  );
  const handleReviewCurrentSceneAppExecution = useCallback(() => {
    const followUpAction = buildSceneAppExecutionReviewFollowUpAction({
      referenceEntries: defaultCuratedTaskReferenceEntries,
    });
    if (!followUpAction) {
      toast.error("当前还没有足够的项目结果基线，暂时无法直接进入下一步判断。");
      return;
    }

    applyWorkbenchFollowUpActionPayload(followUpAction);
  }, [applyWorkbenchFollowUpActionPayload, defaultCuratedTaskReferenceEntries]);
  const handleContinueSceneAppReviewFeedback = useCallback(
    (taskId: string) => {
      const followUpAction = buildSceneAppExecutionCuratedTaskFollowUpAction({
        referenceEntries: defaultCuratedTaskReferenceEntries,
        taskId,
      });
      if (!followUpAction) {
        toast.error("当前判断建议还缺少可继续的结果模板。");
        return;
      }

      applyWorkbenchFollowUpActionPayload(followUpAction);
    },
    [applyWorkbenchFollowUpActionPayload, defaultCuratedTaskReferenceEntries],
  );
  const sceneAppExecutionContentPostEntries = useMemo(
    () =>
      buildSceneAppExecutionContentPostEntries({
        taskFiles,
        sessionFiles,
        artifacts,
      }),
    [artifacts, sessionFiles, taskFiles],
  );
  const sceneAppReviewDecisionRuntime = useSceneAppReviewDecisionRuntime({
    projectId,
    sessionId,
    sceneAppExecutionSummaryState,
    onNavigate: _onNavigate,
  });
  const handleOpenSceneAppExecutionDetail = useCallback(() => {
    if (!_onNavigate) {
      return;
    }

    _onNavigate("agent-app-lab");
  }, [_onNavigate]);
  const handleOpenSceneAppExecutionGovernance = useCallback(() => {
    if (!_onNavigate) {
      return;
    }

    _onNavigate("agent-app-lab");
  }, [_onNavigate]);
  const handleOpenSceneAppExecutionContentPost = useCallback(
    (entry: SceneAppExecutionContentPostEntry) => {
      if (entry.source.kind === "task_file") {
        handleTaskFileClick(entry.source.file);
        return;
      }

      if (entry.source.kind === "artifact") {
        handleArtifactClick(entry.source.artifact);
        return;
      }

      void (async () => {
        try {
          const matchedTaskFile = taskFiles.find((file) =>
            doesWorkspaceFileCandidateMatch(file.name, entry.pathLabel),
          );
          if (matchedTaskFile) {
            handleTaskFileClick(matchedTaskFile);
            return;
          }

          const matchedArtifact = artifacts.find((artifact) =>
            doesWorkspaceFileCandidateMatch(
              resolveArtifactProtocolFilePath(artifact),
              entry.pathLabel,
            ),
          );
          if (matchedArtifact) {
            handleArtifactClick(matchedArtifact);
            return;
          }

          const matchedSessionFile = sessionFiles.find((file) =>
            doesWorkspaceFileCandidateMatch(file.name, entry.pathLabel),
          );
          if (!matchedSessionFile) {
            toast.error("当前发布产物已不存在，暂时无法打开。");
            return;
          }

          const content = await readSessionFile(matchedSessionFile.name);
          if (typeof content !== "string" || !content.trim()) {
            toast.info("该发布产物当前没有可直接预览的正文内容。");
            return;
          }

          handleWorkspaceFileClick(matchedSessionFile.name, content);
        } catch (error) {
          console.error("[AgentChatPage] 打开发布产物失败:", error);
          toast.error("打开发布产物失败，请稍后重试。");
        }
      })();
    },
    [
      artifacts,
      handleArtifactClick,
      handleTaskFileClick,
      handleWorkspaceFileClick,
      readSessionFile,
      sessionFiles,
      taskFiles,
    ],
  );
  const sceneAppExecutionSummaryCard = useMemo(
    () =>
      sceneAppExecutionSummaryState?.summary ? (
        <SceneAppExecutionSummaryCard
          summary={sceneAppExecutionSummaryState.summary}
          latestReviewFeedbackSignal={
            sceneAppReviewDecisionRuntime.latestReviewFeedbackSignal
          }
          onContinueReviewFeedback={handleContinueSceneAppReviewFeedback}
          onReviewCurrentProject={handleReviewCurrentSceneAppExecution}
          onSaveAsSkill={sceneAppReviewDecisionRuntime.handleSaveAsSkill}
          onOpenSceneAppDetail={handleOpenSceneAppExecutionDetail}
          onOpenSceneAppGovernance={handleOpenSceneAppExecutionGovernance}
          humanReviewAvailable={
            sceneAppReviewDecisionRuntime.humanReviewAvailable
          }
          humanReviewLoading={sceneAppReviewDecisionRuntime.loading}
          quickReviewActions={SCENEAPP_QUICK_REVIEW_ACTIONS}
          quickReviewPending={sceneAppReviewDecisionRuntime.quickReviewPending}
          onOpenHumanReview={
            sceneAppReviewDecisionRuntime.handleOpenHumanReview
          }
          onApplyQuickReview={
            sceneAppReviewDecisionRuntime.handleApplyQuickReview
          }
          contentPostEntries={sceneAppExecutionContentPostEntries}
          onContentPostAction={handleOpenSceneAppExecutionContentPost}
        />
      ) : null,
    [
      handleContinueSceneAppReviewFeedback,
      handleOpenSceneAppExecutionContentPost,
      handleOpenSceneAppExecutionDetail,
      handleOpenSceneAppExecutionGovernance,
      handleReviewCurrentSceneAppExecution,
      sceneAppExecutionContentPostEntries,
      sceneAppExecutionSummaryState,
      sceneAppReviewDecisionRuntime,
    ],
  );
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
    imageWorkbenchProviders,
    setImageWorkbenchSelectedProviderId,
    setImageWorkbenchSelectedModelId,
    setImageWorkbenchSelectedSize,
    setLayoutMode,
    setCanvasState,
    updateCurrentImageWorkbenchState,
    handleImageWorkbenchCommand,
  });

  useWorkspaceImageTaskPreviewRuntime({
    sessionId: imageWorkbenchSessionKey,
    projectId,
    contentId,
    projectRootPath: project?.rootPath || null,
    restoreFromWorkspace: shouldRestoreImageTasksFromWorkspace,
    messages,
    currentImageWorkbenchState,
    canvasState,
    setCanvasState,
    setChatMessages,
    updateCurrentImageWorkbenchState,
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
    () => selectLatestPlanComposerDecision(pendingActions),
    [pendingActions],
  );
  const planComposerPendingActions = useMemo(
    () =>
      filterPlanComposerDecisionFromPendingActions(
        pendingActions,
        planComposerDecision,
      ) ?? [],
    [pendingActions, planComposerDecision],
  );
  const [dismissedLocalPlanRequestIds, setDismissedLocalPlanRequestIds] =
    useState<Set<string>>(() => new Set());
  const [submittedLocalPlanRequestIds, setSubmittedLocalPlanRequestIds] =
    useState<Set<string>>(() => new Set());
  useEffect(() => {
    setDismissedLocalPlanRequestIds(new Set());
    setSubmittedLocalPlanRequestIds(new Set());
  }, [sessionId]);
  const localPlanImplementationDecision = useMemo(
    () =>
      !planComposerDecision && !isSending
        ? selectProposedPlanImplementationDecision({
            dismissedRequestIds: dismissedLocalPlanRequestIds,
            messages: displayMessages,
            planState: harnessState.plan,
            submittedRequestIds: submittedLocalPlanRequestIds,
            threadItems: effectiveThreadItems,
          })
        : null,
    [
      harnessState.plan,
      dismissedLocalPlanRequestIds,
      displayMessages,
      effectiveThreadItems,
      isSending,
      planComposerDecision,
      submittedLocalPlanRequestIds,
    ],
  );
  const handleDismissLocalPlanImplementationDecision = useCallback(
    (requestId: string) => {
      setDismissedLocalPlanRequestIds((previous) => {
        if (previous.has(requestId)) {
          return previous;
        }
        const next = new Set(previous);
        next.add(requestId);
        return next;
      });
    },
    [],
  );
  const handleLocalPlanImplementationSubmit = useCallback(
    async (response: ConfirmResponse) => {
      const requestId = response.requestId.trim();
      if (!requestId) {
        return;
      }
      if (!response.confirmed) {
        handleDismissLocalPlanImplementationDecision(requestId);
        return;
      }

      const userData = asRecord(response.userData);
      const adjustment =
        (typeof userData?.answer === "string" ? userData.answer.trim() : "") ||
        (typeof response.response === "string" ? response.response.trim() : "");
      const acceptedLabel = t("agentChat.planComposerDecision.option.accept");
      const isAdjustment = Boolean(adjustment && adjustment !== acceptedLabel);
      const planImplementationMetadata = buildPlanImplementationHarnessMetadata(
        {
          requestArguments: localPlanImplementationDecision?.action.arguments,
          requestId,
          decision: isAdjustment ? "adjustment" : "accepted",
        },
      );
      const sendResult = isAdjustment
        ? await handleSendRef.current(
            [],
            undefined,
            undefined,
            adjustment,
            "react",
            undefined,
            {
              requestMetadata: {
                harness: {
                  ...planImplementationMetadata,
                  collaboration_mode: {
                    mode: "plan",
                    source: "plan_implementation_adjustment",
                  },
                  preferences: {
                    task: true,
                    task_mode: true,
                  },
                  task_mode_enabled: true,
                },
              },
              skipSceneCommandRouting: true,
              toolPreferencesOverride: {
                ...effectiveChatToolPreferences,
                task: true,
              },
            },
          )
        : await handleSendRef.current(
            [],
            undefined,
            undefined,
            "Implement the plan.",
            "react",
            undefined,
            {
              requestMetadata: {
                harness: {
                  ...planImplementationMetadata,
                  collaboration_mode: {
                    mode: "implement",
                    source: "plan_implementation_accept",
                  },
                },
              },
              skipSceneCommandRouting: true,
              toolPreferencesOverride: {
                ...effectiveChatToolPreferences,
                task: false,
              },
            },
          );

      if (!sendResult) {
        return;
      }

      setSubmittedLocalPlanRequestIds((previous) => {
        if (previous.has(requestId)) {
          return previous;
        }
        const next = new Set(previous);
        next.add(requestId);
        return next;
      });
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
      onDismiss={handleDismissLocalPlanImplementationDecision}
    />
  ) : undefined;
  const generalWorkbenchHarnessPanelProps = {
    harnessState,
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
    canInterrupt: isSending,
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
    onOpenSubagentSession: handleOpenSubagentSession,
    onLoadFilePreview: handleHarnessLoadFilePreview,
    onOpenFile: handleWorkspaceFileClick,
    onSubmitCodeFixPrompt: handleSubmitCodeFixPrompt,
  } satisfies Omit<
    ComponentProps<typeof GeneralWorkbenchHarnessSurfaceSection>,
    "enabled"
  >;
  useWorkspaceWorkflowProgressRuntime({
    currentStepIndex,
    hasMessages,
    isSpecializedThemeMode,
    onWorkflowProgressChange,
    steps,
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
    taskFilesExpanded,
    setTaskFilesExpanded,
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
    steps,
    workflowRunState: themeWorkbenchRunState,
    handleSend,
    isPreparingSend,
    isSending,
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
    handleTaskFileClick,
    characters: projectMemory?.characters || [],
    skills,
    serviceSkills: activeTheme === "general" ? serviceSkills : [],
    serviceSkillGroups: activeTheme === "general" ? serviceSkillGroups : [],
    skillsLoading: combinedSkillsLoading,
    onSelectServiceSkill:
      workspaceServiceSkillEntryActions.handleServiceSkillSelect,
    initialInputCapability: effectiveInitialInputCapability,
    initialKnowledgePackSelection,
    pluginSuggestions: workspacePluginInputSuggestions,
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
    mappedTheme,
    activeRuntimeStatusTitle: contextHarnessRuntime.activeRuntimeStatusTitle,
    handleHarnessLoadFilePreview,
    handleFileClick: handleWorkspaceFileClick,
    chatToolPreferences: effectiveChatToolPreferences,
    defaultCuratedTaskReferenceMemoryIds: defaultCuratedTaskReferenceMemoryIds,
    defaultCuratedTaskReferenceEntries: defaultCuratedTaskReferenceEntries,
    pathReferences,
    onAddPathReferences: handleAddPathReferences,
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

  const handleSendFromEmptyState = useTaskCenterEmptyStateSendRuntime({
    agentEntry,
    input,
    setInput,
    activeDraftTabIdRef: activeTaskCenterDraftTabIdRef,
    clearMessages,
    displayMessagesLength: displayMessages.length,
    turnsLength: turns.length,
    threadItemsLength: effectiveThreadItems.length,
    hasDisplayMessages,
    handleSend,
    sessionId,
    taskCenterWorkspaceId,
    setTaskCenterDraftTabs,
    setTaskCenterDraftSendRequest,
    setHomePendingPreviewRequest,
  });
  const handleNonMaterializedTaskCenterSessionReady = useCallback(
    (readySessionId: string) => {
      taskCenterDraftSurfaceActiveRef.current = false;
      setTaskCenterTransitionTopicId(null);
      setTaskCenterDetachedTopicId(null);
      upsertTaskCenterOpenTab(readySessionId, taskCenterWorkspaceId);
      markTaskCenterLocalSessionOverride(readySessionId);
    },
    [
      markTaskCenterLocalSessionOverride,
      setTaskCenterDetachedTopicId,
      setTaskCenterTransitionTopicId,
      taskCenterWorkspaceId,
      upsertTaskCenterOpenTab,
    ],
  );

  useTaskCenterDraftSendDispatchRuntime({
    taskCenterDraftSendRequest,
    setTaskCenterDraftSendRequest,
    setHomePendingPreviewRequest,
    messagesLength: messages.length,
    displayMessagesLength: messages.length,
    currentSessionId: sessionId,
    materializedSessionIdsRef: taskCenterDraftMaterializedSessionIdsRef,
    materializeDraftTab: materializeTaskCenterDraftTab,
    commitMaterializedDraftTab: commitMaterializedTaskCenterDraftTab,
    onNonMaterializedSessionReady: handleNonMaterializedTaskCenterSessionReady,
    sendRef: handleSendRef,
    workspaceId: taskCenterWorkspaceId,
  });

  const shouldHideCurrentSessionContent =
    taskCenterHomeSurfaceState.shouldHideCurrentSessionContent;
  const sceneIsRestoringSession = taskCenterHomeSurfaceState.isRestoringSession;
  const {
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
  } = resolveWorkspaceSceneSessionProjection({
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
  });
  const sceneSessionId = taskCenterHomeSurfaceState.sceneSessionId;
  const sceneMessageListEmptyStateVariant =
    agentEntry === "claw" &&
    !(agentEntry === "claw" && normalizedInitialSessionId) &&
    !shouldRenderTaskCenterEmbeddedHome &&
    !shouldSuppressTaskCenterDraftContent
      ? "task-center"
      : "default";
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
  const [manualRightSurface, setManualRightSurface] =
    useState<WorkspaceRightSurfaceKind | null>(null);
  const [rightSurfaceBrowserTitle, setRightSurfaceBrowserTitle] = useState<
    string | null
  >(null);
  const [activeBrowserRightSurfaceIntent, setActiveBrowserRightSurfaceIntent] =
    useState<WorkspaceRightSurfaceBrowserIntent | null>(null);
  const [activeFilesRightSurfaceTarget, setActiveFilesRightSurfaceTarget] =
    useState<WorkspaceFilesSurfaceTarget | null>(null);
  const [activeAgentAppSurfaces, setActiveAgentAppSurfaces] = useState<
    WorkspaceAgentAppSurfaceDescriptor[]
  >([]);
  const [
    activeAgentAppSurfaceContainerId,
    setActiveAgentAppSurfaceContainerId,
  ] = useState<string | null>(null);
  const [
    activeObjectCanvasRightSurfaceCandidate,
    setActiveObjectCanvasRightSurfaceCandidate,
  ] = useState<WorkspaceObjectCanvasCandidate | null>(null);
  const [activeProductProfile, setActiveProductProfile] =
    useState<WorkspaceProductProfile | null>(null);
  const canvasWorkbenchRootPath =
    sessionWorkingDir?.trim() || project?.rootPath || null;
  const shellRightSurfaceAvailable = Boolean(canvasWorkbenchRootPath);
  const browserRightSurfaceAvailable = true;
  const activePluginActivationContext =
    workspacePluginRuntimeContext.context.status === "active"
      ? workspacePluginRuntimeContext.context.activationContext
      : workspacePluginHistoryRestoreProjection?.status === "restored"
        ? workspacePluginHistoryRestoreProjection.activationContext
        : null;
  const rightSurfaceAppServerPendingRuntime =
    useWorkspaceRightSurfacePendingRuntime({
      enabled: true,
      workspaceId: runtimeWorkspaceId,
      workspaceRoot: canvasWorkbenchRootPath,
      sessionId: sessionId || sceneSessionId,
      pluginActivationContext: activePluginActivationContext,
      pluginContracts: workspacePluginRuntimeContext.context.contracts,
    });
  const { consumePendingRequestsForSurface, dismissPendingRequestsForSurface } =
    rightSurfaceAppServerPendingRuntime;
  const pendingBrowserRightSurfaceIntent =
    rightSurfaceAppServerPendingRuntime.pendingBrowserIntent;
  const browserRightSurfaceIntent =
    activeBrowserRightSurfaceIntent ?? pendingBrowserRightSurfaceIntent;
  const browserRightSurfaceSessionRef =
    browserRightSurfaceIntent?.sessionRef ?? browserAssistSessionRef;
  const browserRightSurfaceUsesBrowserAssistSession =
    browserRightSurfaceSessionRef === browserAssistSessionRef;
  const browserRightSurfaceControlMode =
    browserRightSurfaceIntent?.controlMode ??
    (browserRightSurfaceUsesBrowserAssistSession
      ? browserAssistSessionState?.controlMode
      : null);
  const browserRightSurfaceLifecycleState =
    browserRightSurfaceIntent?.lifecycleState ??
    (browserRightSurfaceUsesBrowserAssistSession
      ? browserAssistSessionState?.lifecycleState
      : null);
  const productProfileFromThreadRead = useMemo(
    () => buildWorkspaceProductProfileFromThreadRead(sceneThreadRead),
    [sceneThreadRead],
  );
  const productProfileFromPluginActivation = useMemo(
    () =>
      buildWorkspacePluginProductProfileFromActivation({
        activationContext: activePluginActivationContext,
        contracts: workspacePluginRuntimeContext.context.contracts,
        workspaceId: runtimeWorkspaceId,
      }),
    [
      activePluginActivationContext,
      runtimeWorkspaceId,
      workspacePluginRuntimeContext.context.contracts,
    ],
  );
  const handleToggleExpertInfoPanel = useCallback(() => {
    setHarnessPanelVisible(false);
    setManualRightSurface(null);
    setActiveFilesRightSurfaceTarget(null);
    setActiveObjectCanvasRightSurfaceCandidate(null);
    setActiveProductProfile(null);
    const shouldOpenExpertInfo =
      expertInfoPanelCollapsed || sceneLayoutMode !== "chat";
    if (shouldOpenExpertInfo) {
      setLayoutMode("chat");
      void consumePendingRequestsForSurface("expertInfo");
    } else {
      void dismissPendingRequestsForSurface(
        "expertInfo",
        "user_closed_surface",
      );
    }
    setExpertInfoPanelCollapsed(!shouldOpenExpertInfo);
  }, [
    consumePendingRequestsForSurface,
    dismissPendingRequestsForSurface,
    expertInfoPanelCollapsed,
    sceneLayoutMode,
    setHarnessPanelVisible,
  ]);
  const liveFilesRightSurfaceTarget: WorkspaceFilesSurfaceTarget | null =
    preferredServiceSkillResultFileTarget ??
    rightSurfaceAppServerPendingRuntime.pendingFileTarget;
  const agentAppSurfaceRightSurfaces =
    activeAgentAppSurfaces.length > 0
      ? activeAgentAppSurfaces
      : rightSurfaceAppServerPendingRuntime.pendingAgentAppSurfaces;
  const agentAppSurfaceRightSurface = selectWorkspaceAgentAppSurfaceDescriptor(
    agentAppSurfaceRightSurfaces,
    activeAgentAppSurfaceContainerId,
  );
  const agentAppSurfaceRightSurfaceAvailable =
    agentAppSurfaceRightSurfaces.length > 0;
  const filesRightSurfaceTarget: WorkspaceFilesSurfaceTarget | null =
    activeFilesRightSurfaceTarget ?? liveFilesRightSurfaceTarget;
  const filesRightSurfaceAvailable = Boolean(
    filesRightSurfaceTarget?.relativePath,
  );
  const browserAssistObjectCanvasCandidateId = browserAssistLaunching
    ? currentBrowserAssistScopeKey ||
      browserAssistSessionState?.sessionId ||
      browserAssistSessionState?.targetId ||
      browserAssistSessionState?.profileKey ||
      browserAssistSessionState?.url ||
      "browser-assist-launching"
    : browserAssistSessionState?.sessionId ||
      browserAssistSessionState?.targetId ||
      browserAssistSessionState?.profileKey ||
      browserAssistSessionState?.url ||
      null;
  const browserAssistObjectCanvasCandidate: WorkspaceObjectCanvasCandidate | null =
    browserAssistObjectCanvasCandidateId
      ? {
          candidateId: browserAssistObjectCanvasCandidateId || "browser-assist",
          title: browserAssistSessionState?.title,
          url: browserAssistSessionState?.url,
          sessionId: browserAssistSessionState?.sessionId,
          profileKey: browserAssistSessionState?.profileKey,
          targetId: browserAssistSessionState?.targetId,
          lifecycleState: browserAssistSessionState?.lifecycleState,
          controlMode: browserAssistSessionState?.controlMode,
          transportKind: browserAssistSessionState?.transportKind,
          launching: browserAssistLaunching,
          sourceKind: "browserAssist",
        }
      : null;
  const objectCanvasRightSurfaceCandidate =
    activeObjectCanvasRightSurfaceCandidate ??
    browserAssistObjectCanvasCandidate ??
    rightSurfaceAppServerPendingRuntime.pendingObjectCanvasCandidate;
  const objectCanvasCandidateId =
    objectCanvasRightSurfaceCandidate?.candidateId ?? null;
  const objectCanvasRightSurfaceAvailable = Boolean(objectCanvasCandidateId);
  const productProfileRightSurface =
    activeProductProfile ??
    rightSurfaceAppServerPendingRuntime.pendingProductProfile ??
    productProfileFromThreadRead ??
    productProfileFromPluginActivation;
  const productProfileRightSurfaceAvailable = Boolean(
    productProfileRightSurface || objectCanvasRightSurfaceAvailable,
  );
  useEffect(() => {
    const pendingAgentAppSurfaces =
      rightSurfaceAppServerPendingRuntime.pendingAgentAppSurfaces;
    if (pendingAgentAppSurfaces.length === 0) {
      return;
    }

    setActiveAgentAppSurfaces((current) =>
      mergeWorkspaceAgentAppSurfaceDescriptors(
        current,
        pendingAgentAppSurfaces,
      ),
    );
    setActiveAgentAppSurfaceContainerId((current) =>
      resolveWorkspaceAgentAppSurfaceActiveContainerId({
        activeContainerId: current,
        preferredContainerId:
          pendingAgentAppSurfaces[pendingAgentAppSurfaces.length - 1]
            ?.containerId,
        surfaces: mergeWorkspaceAgentAppSurfaceDescriptors(
          activeAgentAppSurfaces,
          pendingAgentAppSurfaces,
        ),
      }),
    );
    setHarnessPanelVisible(false);
    setExpertInfoPanelCollapsed(true);
    setManualRightSurface(
      (current) =>
        current ?? (sceneLayoutMode === "chat" ? "appSurface" : current),
    );
    void consumePendingRequestsForSurface("appSurface");
  }, [
    activeAgentAppSurfaces,
    consumePendingRequestsForSurface,
    rightSurfaceAppServerPendingRuntime.pendingAgentAppSurfaces,
    sceneLayoutMode,
    setHarnessPanelVisible,
  ]);
  const rightSurfaceHarnessEnabled =
    !suppressHomeNavbarUtilityActions && showHarnessToggle;
  useEffect(() => {
    if (
      !pendingBrowserRightSurfaceIntent ||
      pendingBrowserRightSurfaceIntent.priority !== "foreground"
    ) {
      return;
    }
    if (
      manualRightSurface === "browser" &&
      activeBrowserRightSurfaceIntent?.sourceRequestId ===
        pendingBrowserRightSurfaceIntent.sourceRequestId
    ) {
      return;
    }

    setHarnessPanelVisible(false);
    setExpertInfoPanelCollapsed(true);
    setActiveFilesRightSurfaceTarget(null);
    setActiveObjectCanvasRightSurfaceCandidate(null);
    setActiveProductProfile(null);
    setActiveBrowserRightSurfaceIntent(pendingBrowserRightSurfaceIntent);
    setRightSurfaceBrowserTitle(
      pendingBrowserRightSurfaceIntent.title?.trim() || null,
    );
    setManualRightSurface("browser");
    void consumePendingRequestsForSurface("browser");
  }, [
    activeBrowserRightSurfaceIntent?.sourceRequestId,
    consumePendingRequestsForSurface,
    manualRightSurface,
    pendingBrowserRightSurfaceIntent,
    setHarnessPanelVisible,
  ]);
  const handleToggleRightSurfaceFiles = useCallback(() => {
    if (!filesRightSurfaceAvailable) {
      return;
    }
    const shouldOpenFiles = manualRightSurface !== "files";
    setHarnessPanelVisible(false);
    setExpertInfoPanelCollapsed(true);
    setActiveObjectCanvasRightSurfaceCandidate(null);
    setActiveProductProfile(null);
    setActiveFilesRightSurfaceTarget(
      shouldOpenFiles ? filesRightSurfaceTarget : null,
    );
    setManualRightSurface(shouldOpenFiles ? "files" : null);
    if (shouldOpenFiles) {
      void consumePendingRequestsForSurface("files");
    } else {
      void dismissPendingRequestsForSurface("files", "user_closed_surface");
    }
  }, [
    consumePendingRequestsForSurface,
    dismissPendingRequestsForSurface,
    filesRightSurfaceAvailable,
    filesRightSurfaceTarget,
    manualRightSurface,
    setHarnessPanelVisible,
  ]);
  const handleToggleRightSurfaceShell = useCallback(() => {
    const shouldOpenShell = manualRightSurface !== "shell";
    setHarnessPanelVisible(false);
    setExpertInfoPanelCollapsed(true);
    setActiveFilesRightSurfaceTarget(null);
    setActiveObjectCanvasRightSurfaceCandidate(null);
    setActiveProductProfile(null);
    setManualRightSurface(shouldOpenShell ? "shell" : null);
    if (shouldOpenShell) {
      void consumePendingRequestsForSurface("shell");
    } else {
      void dismissPendingRequestsForSurface("shell", "user_closed_surface");
    }
  }, [
    consumePendingRequestsForSurface,
    dismissPendingRequestsForSurface,
    manualRightSurface,
    setHarnessPanelVisible,
  ]);
  const handleCloseRightSurfaceShell = useCallback(() => {
    setManualRightSurface((current) => (current === "shell" ? null : current));
    void dismissPendingRequestsForSurface("shell", "user_closed_surface");
  }, [dismissPendingRequestsForSurface]);
  const handleToggleRightSurfaceBrowser = useCallback(() => {
    if (!browserRightSurfaceAvailable) {
      return;
    }
    const shouldOpenBrowser = manualRightSurface !== "browser";
    setHarnessPanelVisible(false);
    setExpertInfoPanelCollapsed(true);
    setActiveFilesRightSurfaceTarget(null);
    setActiveObjectCanvasRightSurfaceCandidate(null);
    setActiveProductProfile(null);
    setManualRightSurface(shouldOpenBrowser ? "browser" : null);
    if (shouldOpenBrowser) {
      if (pendingBrowserRightSurfaceIntent) {
        setActiveBrowserRightSurfaceIntent(pendingBrowserRightSurfaceIntent);
        setRightSurfaceBrowserTitle(
          pendingBrowserRightSurfaceIntent.title?.trim() || null,
        );
      }
      void consumePendingRequestsForSurface("browser");
    } else {
      void dismissPendingRequestsForSurface("browser", "user_closed_surface");
    }
  }, [
    browserRightSurfaceAvailable,
    consumePendingRequestsForSurface,
    dismissPendingRequestsForSurface,
    manualRightSurface,
    pendingBrowserRightSurfaceIntent,
    setHarnessPanelVisible,
  ]);
  const handleRightSurfaceBrowserNavigate = useCallback(
    (_url: string, title?: string | null) => {
      setRightSurfaceBrowserTitle(title?.trim() || null);
    },
    [],
  );
  const handleToggleRightSurfaceObjectCanvas = useCallback(() => {
    if (
      !objectCanvasRightSurfaceAvailable &&
      !productProfileRightSurfaceAvailable
    ) {
      return;
    }
    const targetSurface = productProfileRightSurfaceAvailable
      ? "productProfile"
      : "objectCanvas";
    const shouldOpenObjectCanvas = manualRightSurface !== targetSurface;
    setHarnessPanelVisible(false);
    setExpertInfoPanelCollapsed(true);
    setActiveFilesRightSurfaceTarget(null);
    setActiveObjectCanvasRightSurfaceCandidate(
      shouldOpenObjectCanvas ? objectCanvasRightSurfaceCandidate : null,
    );
    setActiveProductProfile(
      shouldOpenObjectCanvas && productProfileRightSurface
        ? productProfileRightSurface
        : null,
    );
    setManualRightSurface(shouldOpenObjectCanvas ? targetSurface : null);
    if (shouldOpenObjectCanvas) {
      void consumePendingRequestsForSurface(targetSurface);
      if (targetSurface !== "objectCanvas") {
        void consumePendingRequestsForSurface("objectCanvas");
      }
    } else {
      void dismissPendingRequestsForSurface(
        targetSurface,
        "user_closed_surface",
      );
      if (targetSurface !== "objectCanvas") {
        void dismissPendingRequestsForSurface(
          "objectCanvas",
          "user_closed_surface",
        );
      }
    }
  }, [
    consumePendingRequestsForSurface,
    dismissPendingRequestsForSurface,
    manualRightSurface,
    objectCanvasRightSurfaceAvailable,
    objectCanvasRightSurfaceCandidate,
    productProfileRightSurface,
    productProfileRightSurfaceAvailable,
    setHarnessPanelVisible,
  ]);
  const handleToggleRightSurfaceHarness = useCallback(() => {
    if (!rightSurfaceHarnessEnabled) {
      return;
    }
    const shouldOpenHarness = manualRightSurface !== "harness";
    setHarnessPanelVisible(false);
    setExpertInfoPanelCollapsed(true);
    setActiveFilesRightSurfaceTarget(null);
    setActiveObjectCanvasRightSurfaceCandidate(null);
    setActiveProductProfile(null);
    setManualRightSurface(shouldOpenHarness ? "harness" : null);
    if (shouldOpenHarness) {
      void consumePendingRequestsForSurface("harness");
    } else {
      void dismissPendingRequestsForSurface("harness", "user_closed_surface");
    }
  }, [
    consumePendingRequestsForSurface,
    dismissPendingRequestsForSurface,
    manualRightSurface,
    rightSurfaceHarnessEnabled,
    setHarnessPanelVisible,
  ]);
  useEffect(() => {
    if (manualRightSurface === "harness" && !rightSurfaceHarnessEnabled) {
      setManualRightSurface(null);
    }
    if (manualRightSurface === "files" && !filesRightSurfaceAvailable) {
      setManualRightSurface(null);
      setActiveFilesRightSurfaceTarget(null);
    }
    if (
      manualRightSurface === "appSurface" &&
      !agentAppSurfaceRightSurfaceAvailable
    ) {
      setManualRightSurface(null);
      setActiveAgentAppSurfaces([]);
      setActiveAgentAppSurfaceContainerId(null);
    }
    if (
      manualRightSurface === "objectCanvas" &&
      !objectCanvasRightSurfaceAvailable
    ) {
      setManualRightSurface(null);
      setActiveObjectCanvasRightSurfaceCandidate(null);
    }
    if (
      manualRightSurface === "productProfile" &&
      !productProfileRightSurfaceAvailable
    ) {
      setManualRightSurface(null);
      setActiveObjectCanvasRightSurfaceCandidate(null);
      setActiveProductProfile(null);
    }
    if (manualRightSurface === "browser" && !browserRightSurfaceAvailable) {
      setManualRightSurface(null);
    }
  }, [
    agentAppSurfaceRightSurfaceAvailable,
    browserRightSurfaceAvailable,
    filesRightSurfaceAvailable,
    manualRightSurface,
    objectCanvasRightSurfaceAvailable,
    productProfileRightSurfaceAvailable,
    rightSurfaceHarnessEnabled,
  ]);
  const handleToggleCanvasFromRightSurface = useCallback(() => {
    if (manualRightSurface && sceneLayoutMode !== "chat") {
      void dismissPendingRequestsForSurface(
        manualRightSurface,
        "user_switched_surface",
      );
      setManualRightSurface(null);
      setActiveFilesRightSurfaceTarget(null);
      setActiveObjectCanvasRightSurfaceCandidate(null);
      setActiveProductProfile(null);
      return;
    }

    setHarnessPanelVisible(false);
    if (manualRightSurface) {
      void dismissPendingRequestsForSurface(
        manualRightSurface,
        "user_switched_surface",
      );
    }
    setActiveFilesRightSurfaceTarget(null);
    setActiveObjectCanvasRightSurfaceCandidate(null);
    setActiveProductProfile(null);
    setManualRightSurface(null);
    handleToggleCanvas();
  }, [
    dismissPendingRequestsForSurface,
    handleToggleCanvas,
    manualRightSurface,
    sceneLayoutMode,
    setHarnessPanelVisible,
  ]);
  const rightSurfaceOpenSurfaces = useMemo(() => {
    const next: WorkspaceRightSurfaceKind[] = [];
    const add = (kind: WorkspaceRightSurfaceKind, enabled: boolean) => {
      if (enabled && !next.includes(kind)) {
        next.push(kind);
      }
    };

    add("workbench", sceneLayoutMode !== "chat");
    add("appSurface", agentAppSurfaceRightSurfaceAvailable);
    add("productProfile", productProfileRightSurfaceAvailable);
    add(
      "objectCanvas",
      objectCanvasRightSurfaceAvailable && !productProfileRightSurfaceAvailable,
    );
    add("expertInfo", hasExpertInfoPanel);
    add("files", filesRightSurfaceAvailable);
    add("shell", shellRightSurfaceAvailable);
    add("harness", rightSurfaceHarnessEnabled);
    add("objectCanvas", manualRightSurface === "objectCanvas");
    add("productProfile", manualRightSurface === "productProfile");
    add("files", manualRightSurface === "files");
    add("shell", manualRightSurface === "shell");
    add("harness", manualRightSurface === "harness");
    add("appSurface", manualRightSurface === "appSurface");
    add("expertInfo", manualRightSurface === "expertInfo");
    add("browser", manualRightSurface === "browser");
    return next;
  }, [
    agentAppSurfaceRightSurfaceAvailable,
    filesRightSurfaceAvailable,
    hasExpertInfoPanel,
    manualRightSurface,
    objectCanvasRightSurfaceAvailable,
    productProfileRightSurfaceAvailable,
    rightSurfaceHarnessEnabled,
    sceneLayoutMode,
    shellRightSurfaceAvailable,
  ]);
  const rightSurfaceState = resolveWorkspaceRightSurfaceState({
    layoutMode: sceneLayoutMode,
    hasExpertInfo: hasExpertInfoPanel,
    expertInfoVisible: expertInfoPanelVisible,
    openSurfaces: rightSurfaceOpenSurfaces,
    requestedSurface: manualRightSurface ?? undefined,
    source: manualRightSurface ? "user" : undefined,
  });
  const handleSelectRightSurfaceTab = useCallback(
    (kind: WorkspaceRightSurfaceKind) => {
      if (kind === rightSurfaceState.activeSurface) {
        return;
      }

      setHarnessPanelVisible(false);
      setExpertInfoPanelCollapsed(kind !== "expertInfo");
      setActiveFilesRightSurfaceTarget(
        kind === "files" ? filesRightSurfaceTarget : null,
      );
      if (kind === "appSurface" && agentAppSurfaceRightSurface) {
        setActiveAgentAppSurfaces((current) =>
          mergeWorkspaceAgentAppSurfaceDescriptors(current, [
            agentAppSurfaceRightSurface,
          ]),
        );
        setActiveAgentAppSurfaceContainerId(
          agentAppSurfaceRightSurface.containerId,
        );
      }
      setActiveObjectCanvasRightSurfaceCandidate(
        kind === "productProfile" || kind === "objectCanvas"
          ? objectCanvasRightSurfaceCandidate
          : null,
      );
      setActiveProductProfile(
        kind === "productProfile" && productProfileRightSurface
          ? productProfileRightSurface
          : null,
      );
      if (kind === "browser" && pendingBrowserRightSurfaceIntent) {
        setActiveBrowserRightSurfaceIntent(pendingBrowserRightSurfaceIntent);
        setRightSurfaceBrowserTitle(
          pendingBrowserRightSurfaceIntent.title?.trim() || null,
        );
      }
      setManualRightSurface(kind === "workbench" ? null : kind);
      void consumePendingRequestsForSurface(kind);
      if (kind === "productProfile") {
        void consumePendingRequestsForSurface("objectCanvas");
      }
    },
    [
      consumePendingRequestsForSurface,
      agentAppSurfaceRightSurface,
      filesRightSurfaceTarget,
      objectCanvasRightSurfaceCandidate,
      pendingBrowserRightSurfaceIntent,
      productProfileRightSurface,
      rightSurfaceState.activeSurface,
      setHarnessPanelVisible,
    ],
  );
  const handleSelectAgentAppSurface = useCallback(
    (surface: WorkspaceAgentAppSurfaceDescriptor) => {
      setHarnessPanelVisible(false);
      setExpertInfoPanelCollapsed(true);
      setActiveAgentAppSurfaceContainerId(surface.containerId);
      setManualRightSurface("appSurface");
    },
    [setHarnessPanelVisible],
  );
  const handleCloseAgentAppSurface = useCallback(
    (surface: WorkspaceAgentAppSurfaceDescriptor) => {
      const result = closeWorkspaceAgentAppSurfaceDescriptor({
        activeContainerId: activeAgentAppSurfaceContainerId,
        containerId: surface.containerId,
        surfaces: agentAppSurfaceRightSurfaces,
      });
      setActiveAgentAppSurfaces(result.surfaces);
      setActiveAgentAppSurfaceContainerId(result.activeContainerId);
      if (result.surfaces.length === 0 && manualRightSurface === "appSurface") {
        setManualRightSurface(null);
        void dismissPendingRequestsForSurface(
          "appSurface",
          "user_closed_surface",
        );
      }
    },
    [
      activeAgentAppSurfaceContainerId,
      agentAppSurfaceRightSurfaces,
      dismissPendingRequestsForSurface,
      manualRightSurface,
    ],
  );
  const handleProductProfileActionIntent = useCallback(
    async (intent: WorkspaceProductProfileActionIntent) => {
      setLayoutMode("chat");
      await submitWorkspaceProductProfileActionIntent({
        intent,
        restoreInput: setInput,
        submit: async (prompt, options) =>
          await handleSendRef.current(
            [],
            undefined,
            undefined,
            prompt,
            "react",
            undefined,
            options,
          ),
      });
    },
    [handleSendRef, setInput],
  );
  const handleProductProfileSelectedObjectChange = useCallback(
    (change: WorkspaceProductProfileSelectionChange) => {
      const request =
        buildWorkspaceProductProfileSelectionUpdateRequest(change);
      if (!request) {
        return;
      }
      void updateAgentRuntimeSession(request).catch((error) => {
        console.warn(
          "[AgentChatWorkspace] Product Profile selection 写回失败:",
          error,
        );
      });
    },
    [],
  );
  const handleProductProfilePreviewArtifactOpen = useCallback(
    (artifact: Artifact) => {
      handleWorkspaceArtifactClick(artifact);
    },
    [handleWorkspaceArtifactClick],
  );
  const expertInfoPanelNode = (
    <ExpertInfoPanel
      requestMetadata={expertPanelRequestMetadata}
      localSkills={skills}
      serviceSkills={serviceSkills}
      workspaceSkillBindings={workspaceSkillBindingsRuntime.bindings}
      skillsLoading={combinedSkillsLoading}
      threadItems={effectiveThreadItems}
      skillRefsEdited={
        expertSkillRefsOverride !== null ||
        expertWorkspaceSkillRuntimeEnableRefs.length > 0
      }
      enabledWorkspaceSkillRuntimeCount={
        expertWorkspaceSkillRuntimeEnableBindings.length
      }
      onSkillRefsChange={handleExpertSkillRefsChange}
      onEnableWorkspaceSkillRuntime={handleEnableExpertWorkspaceSkillRuntime}
      onOpenSkillsManage={
        _onNavigate ? handleOpenSkillsManageFromExpertPanel : undefined
      }
    />
  );
  const rightSurfaceDefinitions = buildWorkspaceRightSurfaceDefinitions({
    expertInfo: () => expertInfoPanelNode,
    ...(agentAppSurfaceRightSurface
      ? {
          appSurface: () => (
            <WorkspaceAgentAppSurface
              activeContainerId={activeAgentAppSurfaceContainerId}
              surfaces={agentAppSurfaceRightSurfaces}
              surface={agentAppSurfaceRightSurface}
              onCloseSurface={handleCloseAgentAppSurface}
              onSelectSurface={handleSelectAgentAppSurface}
            />
          ),
        }
      : {}),
    ...(productProfileRightSurface || objectCanvasRightSurfaceAvailable
      ? {
          productProfile: () =>
            productProfileRightSurface ? (
              <WorkspaceProductProfileSurface
                actionsDisabled={sceneIsSending || sceneIsPreparingSend}
                profile={productProfileRightSurface}
                onActionIntent={handleProductProfileActionIntent}
                onOpenPreviewArtifact={handleProductProfilePreviewArtifactOpen}
                onSelectedObjectChange={
                  handleProductProfileSelectedObjectChange
                }
              />
            ) : (
              <WorkspaceObjectCanvasSurface
                candidate={objectCanvasRightSurfaceCandidate}
                onOpenBrowserRuntime={
                  browserAssistObjectCanvasCandidate
                    ? handleOpenBrowserRuntimeForBrowserAssist
                    : undefined
                }
              />
            ),
          objectCanvas: () => (
            <WorkspaceObjectCanvasSurface
              candidate={objectCanvasRightSurfaceCandidate}
              onOpenBrowserRuntime={
                browserAssistObjectCanvasCandidate
                  ? handleOpenBrowserRuntimeForBrowserAssist
                  : undefined
              }
            />
          ),
        }
      : {}),
    ...(filesRightSurfaceAvailable
      ? {
          files: () => (
            <WorkspaceFilesSurface
              target={filesRightSurfaceTarget}
              onOpenResultFile={
                preferredServiceSkillResultFileTarget
                  ? handleOpenServiceSkillResultFile
                  : undefined
              }
            />
          ),
        }
      : {}),
    ...(browserRightSurfaceAvailable
      ? {
          browser: {
            label:
              rightSurfaceBrowserTitle ??
              browserRightSurfaceIntent?.title ??
              browserRightSurfaceSessionRef?.title ??
              null,
            render: () => (
              <RightSurfaceBrowserPanel
                active={rightSurfaceState.activeSurface === "browser"}
                controlMode={browserRightSurfaceControlMode}
                initialUrl={browserRightSurfaceSessionRef?.launchUrl ?? null}
                lifecycleState={browserRightSurfaceLifecycleState}
                sessionRef={browserRightSurfaceSessionRef}
                onNavigate={handleRightSurfaceBrowserNavigate}
              />
            ),
          },
        }
      : {}),
    ...(rightSurfaceHarnessEnabled
      ? {
          harness: () => (
            <GeneralWorkbenchHarnessSurfaceSection
              enabled={rightSurfaceHarnessEnabled}
              {...generalWorkbenchHarnessPanelProps}
            />
          ),
        }
      : {}),
    shell: () => (
      <TaskCenterShellPanel
        variant="surface"
        projectRootPath={canvasWorkbenchRootPath}
        onClose={handleCloseRightSurfaceShell}
      />
    ),
  });
  const hasActiveRightSurfaceDefinition = rightSurfaceDefinitions.some(
    (definition) => definition.kind === rightSurfaceState.activeSurface,
  );
  const rightSurfaceContent =
    rightSurfaceState.activeSurface && hasActiveRightSurfaceDefinition ? (
      <RightSurfaceHost
        activeSurface={rightSurfaceState.activeSurface}
        definitions={rightSurfaceDefinitions}
        openSurfaces={rightSurfaceState.openSurfaces}
        onSelectSurface={handleSelectRightSurfaceTab}
      />
    ) : null;
  const generalWorkbenchSidebarNode = (
    <WorkspaceGeneralWorkbenchSidebar
      visible={showGeneralWorkbenchSidebar}
      isThemeWorkbench={isThemeWorkbench}
      enablePanelCollapse={
        generalWorkbenchScaffoldRuntime.enableGeneralWorkbenchPanelCollapse
      }
      onRequestCollapse={handleCollapseGeneralWorkbenchSidebar}
      generalWorkbenchHarnessSummary={
        harnessInventoryRuntime.generalWorkbenchHarnessSummary
      }
      harnessPanelVisible={rightSurfaceState.activeSurface === "harness"}
      onToggleHarnessPanel={handleToggleRightSurfaceHarness}
      workflow={{
        projectId,
        sessionId,
        branchItems: generalWorkbenchScaffoldRuntime.branchItems,
        onCreateVersionSnapshot: handleCreateVersionSnapshot,
        onSwitchBranchVersion: handleSwitchBranchVersion,
        onDeleteTopic: handleDeleteGeneralWorkbenchVersion,
        onSetBranchStatus: handleSetBranchStatus,
        workflowSteps:
          generalWorkbenchSidebarRuntime.generalWorkbenchWorkflowSteps,
        onAddImage: handleAddImage,
        onImportDocument: handleImportDocument,
        onApplyFollowUpAction: handleApplyGeneralWorkbenchFollowUpAction,
        activityLogs:
          generalWorkbenchSidebarRuntime.generalWorkbenchActivityLogs,
        creationTaskEvents:
          generalWorkbenchScaffoldRuntime.generalWorkbenchCreationTaskEvents,
        onViewRunDetail:
          generalWorkbenchSidebarRuntime.handleViewGeneralWorkbenchRunDetail,
        activeRunDetail:
          generalWorkbenchSidebarRuntime.selectedGeneralWorkbenchRunDetail,
        activeRunDetailLoading:
          generalWorkbenchSidebarRuntime.generalWorkbenchRunDetailLoading,
      }}
      contextWorkspace={contextHarnessRuntime.contextWorkspace}
      onViewContextDetail={handleViewContextDetail}
      history={{
        hasMore: generalWorkbenchSidebarRuntime.generalWorkbenchHistoryHasMore,
        loading: generalWorkbenchSidebarRuntime.generalWorkbenchHistoryLoading,
        onLoadMore:
          generalWorkbenchSidebarRuntime.handleLoadMoreGeneralWorkbenchHistory,
        skillDetailMap:
          generalWorkbenchSidebarRuntime.generalWorkbenchSkillDetailMap,
        messages,
      }}
    />
  );
  const rightSurfaceRuntimePendingIntents = useMemo(() => {
    return buildWorkspaceRightSurfaceRuntimePendingIntents({
      createdAt: Date.now(),
      harnessPendingCount,
      objectCanvasCandidateId: browserAssistObjectCanvasCandidateId,
      preferredServiceSkillResultFileTargetRelativePath:
        preferredServiceSkillResultFileTarget?.relativePath,
      showHarnessToggle,
      suppressHomeNavbarUtilityActions,
    });
  }, [
    browserAssistObjectCanvasCandidateId,
    harnessPendingCount,
    preferredServiceSkillResultFileTarget?.relativePath,
    showHarnessToggle,
    suppressHomeNavbarUtilityActions,
  ]);
  const rightSurfacePendingIntents = useMemo(
    () => [
      ...rightSurfaceRuntimePendingIntents,
      ...rightSurfaceAppServerPendingRuntime.pendingIntents,
    ],
    [
      rightSurfaceAppServerPendingRuntime.pendingIntents,
      rightSurfaceRuntimePendingIntents,
    ],
  );
  const rightSurfaceLaunchers = buildWorkspaceRightSurfaceRuntimeLaunchers({
    surfaceState: rightSurfaceState,
    pendingIntents: rightSurfacePendingIntents,
    filesAvailable: filesRightSurfaceAvailable,
    appSurfaceAvailable: agentAppSurfaceRightSurfaceAvailable,
    hasExpertInfoPanel,
    objectCanvasAvailable: objectCanvasRightSurfaceAvailable,
    productProfileAvailable: productProfileRightSurfaceAvailable,
    shellAvailable: shellRightSurfaceAvailable,
    showHarnessToggle,
    suppressHomeNavbarUtilityActions,
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
    workspaceHintMessage: shouldUseBrowserWorkspaceHomeChrome
      ? BROWSER_WORKSPACE_HOME_HINT_MESSAGE
      : undefined,
    workspaceHintVisible:
      shouldUseBrowserWorkspaceHomeChrome && browserWorkspaceHintVisible,
    onDismissWorkspaceHint: handleDismissBrowserWorkspaceHint,
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
    input,
    setInput,
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
    initialInputCapability: effectiveInitialInputCapability,
    handleNavigateToSkillSettings,
    handleRefreshSkills,
    handleOpenBrowserAssistInCanvas: handleOpenBrowserRuntimeForBrowserAssist,
    browserAssistLaunching,
    recentSessionTitle: recentSessionTopic?.title ?? null,
    recentSessionSummary: recentSessionTopic?.lastPreview ?? null,
    recentSessionActionLabel,
    handleResumeRecentSession,
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
      rightSurfaceState.activeSurface === "objectCanvas" ||
      rightSurfaceState.activeSurface === "productProfile",
    onToggleRightSurfaceObjectCanvas: handleToggleRightSurfaceObjectCanvas,
    rightSurfaceBrowserOpen: rightSurfaceState.activeSurface === "browser",
    onToggleRightSurfaceBrowser: handleToggleRightSurfaceBrowser,
    rightSurfaceFilesOpen: rightSurfaceState.activeSurface === "files",
    onToggleRightSurfaceFiles: handleToggleRightSurfaceFiles,
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
    steps,
    activityLogs: generalWorkbenchSidebarRuntime.generalWorkbenchActivityLogs,
    creationTaskEvents:
      generalWorkbenchScaffoldRuntime.generalWorkbenchCreationTaskEvents,
    currentStepIndex,
    goToStep,
    displayMessages: sceneDisplayMessages,
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

  const fileManagerNode = fileManagerSidebar.fileManagerOpen ? (
    <FileManagerSidebar
      onClose={fileManagerSidebar.closeFileManagerSidebar}
      onAddPathReferences={handleAddPathReferences}
      onImportAsKnowledge={inputbarScene.onImportPathReferenceAsKnowledge}
      onOpenFileInWorkspace={(entry) => {
        void openProjectFilePreviewInCanvas({
          absolutePath: entry.path,
        });
      }}
      onInstallSkillPackage={
        _onNavigate ? handleInstallSkillPackageFromFileManager : undefined
      }
      initialDirectory={project?.rootPath || null}
    />
  ) : null;
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
        rightRailNode={null}
      />
      <AutomationJobDialog
        open={workspaceServiceSkillEntryActions.automationDialogOpen}
        mode="create"
        workspaces={workspaceServiceSkillEntryActions.automationWorkspaces}
        initialValues={
          workspaceServiceSkillEntryActions.automationDialogInitialValues
        }
        saving={workspaceServiceSkillEntryActions.automationJobSaving}
        onOpenChange={
          workspaceServiceSkillEntryActions.handleAutomationDialogOpenChange
        }
        onSubmit={
          workspaceServiceSkillEntryActions.handleAutomationDialogSubmit
        }
      />
      <RuntimeReviewDecisionDialog
        open={sceneAppReviewDecisionRuntime.dialogOpen}
        template={sceneAppReviewDecisionRuntime.template}
        saving={sceneAppReviewDecisionRuntime.saving}
        onOpenChange={sceneAppReviewDecisionRuntime.setDialogOpen}
        onSave={sceneAppReviewDecisionRuntime.handleSaveHumanReview}
      />
    </>
  );
}
