import {
  useCallback,
  useMemo,
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { Info, Palette } from "lucide-react";
import styled from "styled-components";
import { Switch } from "@/components/ui/switch";
import type { Character } from "@/lib/api/projectMemory";
import type { AsterSubagentParentContext } from "@/lib/api/agentRuntime";
import type {
  AgentInitialInputCapabilityParams,
  AgentInitialKnowledgePackSelectionParams,
} from "@/types/page";
import { Inputbar } from "../components/Inputbar";
import type { TaskFile } from "../components/TaskFiles";
import { CONVERSATION_CONTENT_MAX_WIDTH } from "../styles/conversationLayoutTokens";
import { useWorkspaceNavigationActions } from "./useWorkspaceNavigationActions";
import type { Message } from "../types";
import {
  DEFAULT_CHAT_TOOL_PREFERENCES,
  type ChatToolPreferences,
} from "../utils/chatToolPreferences";
import {
  deriveRuntimeToolAvailability,
  type RuntimeToolAvailability,
} from "../utils/runtimeToolAvailability";
import { resolveCanvasTaskFileTarget } from "../utils/taskFileCanvasSync";
import { GeneralWorkbenchDialogSection } from "./WorkspaceHarnessDialogs";
import type { InputbarSendHandler } from "../components/Inputbar/inputbarSendPayload";
import type { GeneralWorkbenchEntryPromptState } from "./workspaceSendHelpers";
import type { WorkspaceHandleSend } from "./useWorkspaceSendActions";
import type { CuratedTaskReferenceEntry } from "../utils/curatedTaskReferenceSelection";
import type { TeamDefinition } from "../utils/teamDefinitions";
import { isRenderableTaskFile } from "./generalWorkbenchHelpers";
import { useWorkspaceKnowledgeRuntime } from "./knowledge/useWorkspaceKnowledgeRuntime";

interface GeneralWorkbenchEntryPromptAccessoryProps {
  prompt: GeneralWorkbenchEntryPromptState;
  restartLabel: string;
  onRestart: () => void;
  onContinue: () => Promise<void> | void;
}

interface SoulArtifactVoiceAccessoryProps {
  enabled: boolean;
  title: string;
  enabledLabel: string;
  disabledLabel: string;
  toggleAria: string;
  onEnabledChange: (enabled: boolean) => void;
}

const InputbarOverlayAccessoryStack = styled.div`
  display: flex;
  width: 100%;
  max-width: 100%;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
`;

const PlanDecisionInputbarReplacement = styled.div`
  width: min(100%, ${CONVERSATION_CONTENT_MAX_WIDTH});
  max-width: 100%;
`;

const SoulArtifactVoiceCard = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: min(320px, calc(100vw - 48px));
  min-height: 42px;
  padding: 8px 10px 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(167, 243, 208, 0.9);
  background: rgba(255, 255, 255, 0.98);
  color: #0f172a;
  box-shadow: 0 14px 28px -24px rgba(15, 23, 42, 0.24);
`;

const SoulArtifactVoiceIcon = styled.span`
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(236, 253, 245, 0.98);
  color: #047857;
`;

const SoulArtifactVoiceText = styled.span`
  display: inline-flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
`;

const SoulArtifactVoiceTitle = styled.span`
  overflow: hidden;
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SoulArtifactVoiceStatus = styled.span<{ $enabled: boolean }>`
  color: ${({ $enabled }) => ($enabled ? "#047857" : "#64748b")};
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
`;

const GeneralWorkbenchEntryPromptCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: min(360px, calc(100vw - 48px));
  max-width: min(420px, calc(100vw - 48px));
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(191, 219, 254, 0.92);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.98) 0%,
    rgba(239, 246, 255, 0.96) 100%
  );
  color: #0f172a;
  box-shadow: 0 18px 34px -28px rgba(15, 23, 42, 0.26);
`;

const GeneralWorkbenchEntryPromptHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
`;

const GeneralWorkbenchEntryPromptTitleWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const GeneralWorkbenchEntryPromptTitle = styled.span`
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
`;

const GeneralWorkbenchEntryPromptDescription = styled.span`
  font-size: 12px;
  line-height: 1.5;
  color: #475569;
`;

const GeneralWorkbenchEntryPromptActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

const GeneralWorkbenchEntryPromptButton = styled.button<{
  $variant?: "primary" | "ghost";
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 88px;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid
    ${({ $variant }) =>
      $variant === "ghost"
        ? "rgba(191, 219, 254, 0.92)"
        : "rgba(59, 130, 246, 0.94)"};
  background: ${({ $variant }) =>
    $variant === "ghost"
      ? "rgba(255, 255, 255, 0.92)"
      : "linear-gradient(180deg, rgba(59,130,246,0.96) 0%, rgba(37,99,235,0.96) 100%)"};
  color: ${({ $variant }) => ($variant === "ghost" ? "#1e293b" : "#eff6ff")};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 24px -18px rgba(37, 99, 235, 0.46);
    background: ${({ $variant }) =>
      $variant === "ghost"
        ? "rgba(239, 246, 255, 0.98)"
        : "linear-gradient(180deg, rgba(37,99,235,0.98) 0%, rgba(29,78,216,0.98) 100%)"};
  }
`;

function renderSoulArtifactVoiceAccessory({
  enabled,
  title,
  enabledLabel,
  disabledLabel,
  toggleAria,
  onEnabledChange,
}: SoulArtifactVoiceAccessoryProps): ReactNode {
  return (
    <SoulArtifactVoiceCard data-testid="soul-artifact-voice-turn-toggle">
      <SoulArtifactVoiceIcon aria-hidden="true">
        <Palette className="h-3.5 w-3.5" />
      </SoulArtifactVoiceIcon>
      <SoulArtifactVoiceText>
        <SoulArtifactVoiceTitle>{title}</SoulArtifactVoiceTitle>
        <SoulArtifactVoiceStatus $enabled={enabled}>
          {enabled ? enabledLabel : disabledLabel}
        </SoulArtifactVoiceStatus>
      </SoulArtifactVoiceText>
      <Switch
        checked={enabled}
        aria-label={toggleAria}
        data-testid="soul-artifact-voice-turn-switch"
        onCheckedChange={onEnabledChange}
      />
    </SoulArtifactVoiceCard>
  );
}

function renderGeneralWorkbenchEntryPromptAccessory({
  prompt,
  restartLabel,
  onRestart,
  onContinue,
}: GeneralWorkbenchEntryPromptAccessoryProps): ReactNode {
  return (
    <GeneralWorkbenchEntryPromptCard data-testid="theme-workbench-entry-prompt">
      <GeneralWorkbenchEntryPromptHeader>
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
        <GeneralWorkbenchEntryPromptTitleWrap>
          <GeneralWorkbenchEntryPromptTitle>
            {prompt.title}
          </GeneralWorkbenchEntryPromptTitle>
          <GeneralWorkbenchEntryPromptDescription>
            {prompt.description}
          </GeneralWorkbenchEntryPromptDescription>
        </GeneralWorkbenchEntryPromptTitleWrap>
      </GeneralWorkbenchEntryPromptHeader>
      <GeneralWorkbenchEntryPromptActions>
        <GeneralWorkbenchEntryPromptButton
          type="button"
          $variant="ghost"
          data-testid="theme-workbench-entry-restart"
          onClick={onRestart}
        >
          {restartLabel}
        </GeneralWorkbenchEntryPromptButton>
        <GeneralWorkbenchEntryPromptButton
          type="button"
          data-testid="theme-workbench-entry-continue"
          onClick={() => {
            void onContinue();
          }}
        >
          {prompt.actionLabel}
        </GeneralWorkbenchEntryPromptButton>
      </GeneralWorkbenchEntryPromptActions>
    </GeneralWorkbenchEntryPromptCard>
  );
}

type WorkspaceInputbarBuilderParams = Omit<
  ComponentProps<typeof Inputbar>,
  "overlayAccessory"
>;

interface UseWorkspaceInputbarScenePresentationRuntimeParams {
  setMentionedCharacters: Dispatch<SetStateAction<Character[]>>;
  taskFiles?: TaskFile[];
  selectedFileId?: string;
  isThemeWorkbench: boolean;
  inputbarPresentation: {
    inputbar: Omit<
      WorkspaceInputbarBuilderParams,
      | "onSelectCharacter"
    >;
    generalWorkbenchEntryPrompt: GeneralWorkbenchEntryPromptState | null;
    onRestartGeneralWorkbenchEntryPrompt: () => void;
    onContinueGeneralWorkbenchEntryPrompt: () => Promise<void> | void;
    planDecisionAccessory?: ReactNode;
    soulArtifactVoiceGenerationBrief?: Record<string, unknown> | null;
    soulArtifactVoiceEnabledForTurn: boolean;
    onSoulArtifactVoiceEnabledForTurnChange: (enabled: boolean) => void;
    generalWorkbenchDialog: ComponentProps<
      typeof GeneralWorkbenchDialogSection
    >;
  };
}
interface WorkspaceInputbarScenePresentationRuntimeResult {
  activeCanvasTaskFile: TaskFile | null;
  inputbarNode: ReactNode;
  generalWorkbenchDialog: ReactNode;
  runtimeToolAvailability: RuntimeToolAvailability | null | undefined;
}
type InputbarScenePresentationParams =
  UseWorkspaceInputbarScenePresentationRuntimeParams;
type InputbarPresentationParams =
  InputbarScenePresentationParams["inputbarPresentation"];
type InputbarParams = InputbarPresentationParams["inputbar"];
type GeneralWorkbenchDialogParams =
  InputbarPresentationParams["generalWorkbenchDialog"];
type NavigationActions = ReturnType<typeof useWorkspaceNavigationActions>;
type WorkspaceInputbarToolStates = NonNullable<
  ComponentProps<typeof Inputbar>["toolStates"]
>;

function useWorkspaceInputbarScenePresentationRuntime({
  setMentionedCharacters,
  taskFiles = [],
  selectedFileId,
  isThemeWorkbench,
  inputbarPresentation,
}: UseWorkspaceInputbarScenePresentationRuntimeParams): WorkspaceInputbarScenePresentationRuntimeResult {
  const { t } = useTranslation("agent");
  const handleSelectCharacter = useCallback(
    (character: Character) => {
      setMentionedCharacters((previous) => {
        if (previous.find((item) => item.id === character.id)) {
          return previous;
        }
        return [...previous, character];
      });
    },
    [setMentionedCharacters],
  );

  const visibleTaskFiles = useMemo(
    () =>
      taskFiles.filter((file) => isRenderableTaskFile(file, isThemeWorkbench)),
    [isThemeWorkbench, taskFiles],
  );

  const visibleSelectedFileId = useMemo(() => {
    if (!selectedFileId) {
      return undefined;
    }

    return visibleTaskFiles.some((file) => file.id === selectedFileId)
      ? selectedFileId
      : undefined;
  }, [selectedFileId, visibleTaskFiles]);

  const activeCanvasTaskFile = useMemo(
    () =>
      resolveCanvasTaskFileTarget(visibleTaskFiles, visibleSelectedFileId)
        .targetFile,
    [visibleSelectedFileId, visibleTaskFiles],
  );

  const generalWorkbenchEntryPromptAccessory = useMemo(
    () =>
      inputbarPresentation.generalWorkbenchEntryPrompt
        ? renderGeneralWorkbenchEntryPromptAccessory({
            prompt: inputbarPresentation.generalWorkbenchEntryPrompt,
            restartLabel: t(
              "agentChat.workspace.generalWorkbenchEntryPrompt.restart",
            ),
            onRestart:
              inputbarPresentation.onRestartGeneralWorkbenchEntryPrompt,
            onContinue:
              inputbarPresentation.onContinueGeneralWorkbenchEntryPrompt,
          })
        : null,
    [
      inputbarPresentation.generalWorkbenchEntryPrompt,
      inputbarPresentation.onContinueGeneralWorkbenchEntryPrompt,
      inputbarPresentation.onRestartGeneralWorkbenchEntryPrompt,
      t,
    ],
  );

  const soulArtifactVoiceAccessory = useMemo(
    () =>
      inputbarPresentation.soulArtifactVoiceGenerationBrief
        ? renderSoulArtifactVoiceAccessory({
            enabled: inputbarPresentation.soulArtifactVoiceEnabledForTurn,
            title: t("agentChat.workspace.soulArtifactVoice.title"),
            enabledLabel: t("agentChat.workspace.soulArtifactVoice.enabled"),
            disabledLabel: t("agentChat.workspace.soulArtifactVoice.disabled"),
            toggleAria: t("agentChat.workspace.soulArtifactVoice.toggleAria"),
            onEnabledChange:
              inputbarPresentation.onSoulArtifactVoiceEnabledForTurnChange,
          })
        : null,
    [
      inputbarPresentation.onSoulArtifactVoiceEnabledForTurnChange,
      inputbarPresentation.soulArtifactVoiceEnabledForTurn,
      inputbarPresentation.soulArtifactVoiceGenerationBrief,
      t,
    ],
  );

  const workspaceInputbarProps = useMemo<WorkspaceInputbarBuilderParams>(
    () => ({
      ...inputbarPresentation.inputbar,
      onSelectCharacter: handleSelectCharacter,
    }),
    [handleSelectCharacter, inputbarPresentation.inputbar],
  );

  const overlayAccessory =
    generalWorkbenchEntryPromptAccessory || soulArtifactVoiceAccessory ? (
      <InputbarOverlayAccessoryStack>
        {generalWorkbenchEntryPromptAccessory}
        {soulArtifactVoiceAccessory}
      </InputbarOverlayAccessoryStack>
    ) : undefined;
  const inputbarNode = inputbarPresentation.planDecisionAccessory ? (
    <PlanDecisionInputbarReplacement data-testid="plan-decision-inputbar-replacement">
      {inputbarPresentation.planDecisionAccessory}
    </PlanDecisionInputbarReplacement>
  ) : (
    <Inputbar {...workspaceInputbarProps} overlayAccessory={overlayAccessory} />
  );
  const generalWorkbenchDialog = (
    <GeneralWorkbenchDialogSection
      {...inputbarPresentation.generalWorkbenchDialog}
    />
  );
  return {
    activeCanvasTaskFile,
    inputbarNode,
    generalWorkbenchDialog,
    runtimeToolAvailability:
      inputbarPresentation.generalWorkbenchDialog.runtimeToolAvailability,
  };
}

interface UseWorkspaceInputbarSceneRuntimeParams {
  contextVariant?: "default" | "task-center";
  setMentionedCharacters: InputbarScenePresentationParams["setMentionedCharacters"];
  taskFiles?: InputbarScenePresentationParams["taskFiles"];
  selectedFileId?: InputbarScenePresentationParams["selectedFileId"];
  isThemeWorkbench: InputbarScenePresentationParams["isThemeWorkbench"];
  sessionId: InputbarParams["sessionId"];
  childSubagentSessions: GeneralWorkbenchDialogParams["childSubagentSessions"];
  subagentParentContext?: AsterSubagentParentContext | null;
  selectedTeamLabel: GeneralWorkbenchDialogParams["selectedTeamLabel"];
  selectedTeamSummary: GeneralWorkbenchDialogParams["selectedTeamSummary"];
  teamMemorySnapshot: GeneralWorkbenchDialogParams["teamMemorySnapshot"];
  currentSessionTitle: string | null | undefined;
  handleStopSending: InputbarParams["onStop"];
  handleOpenSubagentSession: GeneralWorkbenchDialogParams["onOpenSubagentSession"];
  input: InputbarParams["input"];
  setInput: InputbarParams["setInput"];
  currentGate: InputbarParams["workflowGate"];
  generalWorkbenchWorkflowSteps: InputbarParams["workflowSteps"];
  steps: InputbarParams["workflowSteps"];
  workflowRunState: InputbarParams["workflowRunState"];
  handleSend: WorkspaceHandleSend;
  isPreparingSend: boolean;
  isSending: boolean;
  isSessionRestoring?: boolean;
  providerType: InputbarParams["providerType"];
  setProviderType: InputbarParams["setProviderType"];
  model: InputbarParams["model"];
  setModel: InputbarParams["setModel"];
  reasoningEffort: InputbarParams["reasoningEffort"];
  setReasoningEffort: InputbarParams["setReasoningEffort"];
  sessionExecutionRuntime: InputbarParams["executionRuntime"];
  projectId: string | null | undefined;
  openedProjects: InputbarParams["openedProjects"];
  projectRootPath: string | null | undefined;
  accessMode: InputbarParams["accessMode"];
  setAccessMode: InputbarParams["setAccessMode"];
  activeTheme: InputbarParams["activeTheme"];
  navigationActions: Pick<
    NavigationActions,
    | "handleManageProviders"
    | "handleOpenExecutionPolicySettings"
    | "handleOpenRuntimeMemoryWorkbench"
    | "handleOpenKnowledgeManagement"
    | "handleProjectChange"
  >;
  selectedTeam?: TeamDefinition | null;
  characters: InputbarParams["characters"];
  skills: InputbarParams["skills"];
  serviceSkills: InputbarParams["serviceSkills"];
  serviceSkillGroups: InputbarParams["serviceSkillGroups"];
  skillsLoading: InputbarParams["isSkillsLoading"];
  onSelectServiceSkill: InputbarParams["onSelectServiceSkill"];
  onSkillSuggestionsNeeded?: InputbarParams["onSkillSuggestionsNeeded"];
  initialInputCapability?: AgentInitialInputCapabilityParams;
  initialKnowledgePackSelection?: AgentInitialKnowledgePackSelectionParams;
  pluginSuggestions?: InputbarParams["pluginSuggestions"];
  pluginSuggestionsError?: string | null;
  pluginSuggestionsLoading?: boolean;
  onPluginSuggestionsNeeded?: InputbarParams["onPluginSuggestionsNeeded"];
  setChatToolPreferences: Dispatch<SetStateAction<ChatToolPreferences>>;
  objectiveEnabled?: boolean;
  onObjectiveEnabledChange?: (enabled: boolean) => void;
  handleNavigateToSkillSettings: InputbarParams["onNavigateToSettings"];
  handleRefreshSkills: InputbarParams["onRefreshSkills"];
  soulArtifactVoiceGenerationBrief?: Record<string, unknown> | null;
  soulArtifactVoiceEnabledForTurn: boolean;
  onSoulArtifactVoiceEnabledForTurnChange: (enabled: boolean) => void;
  turns: GeneralWorkbenchDialogParams["turns"];
  threadItems: GeneralWorkbenchDialogParams["threadItems"];
  currentTurnId: GeneralWorkbenchDialogParams["currentTurnId"];
  threadRead: GeneralWorkbenchDialogParams["threadRead"];
  activeExecutionRuntime: GeneralWorkbenchDialogParams["executionRuntime"];
  pendingActions: GeneralWorkbenchDialogParams["pendingActions"];
  submittedActionsInFlight: GeneralWorkbenchDialogParams["submittedActionsInFlight"];
  onRespondToAction?: GeneralWorkbenchDialogParams["onRespondToAction"];
  messages: Message[];
  queuedTurns: InputbarParams["queuedTurns"];
  resumeThread: GeneralWorkbenchDialogParams["onResumeThread"];
  replayPendingAction?: (
    requestId: string,
    assistantMessageId: string,
  ) => boolean | Promise<boolean>;
  promoteQueuedTurn?: (queuedTurnId: string) => boolean | Promise<boolean>;
  onObjectiveChanged?: GeneralWorkbenchDialogParams["onObjectiveChanged"];
  removeQueuedTurn: InputbarParams["onRemoveQueuedTurn"];
  latestAssistantMessageId: string | null;
  sessionIdForDiagnostics: string | null;
  generalWorkbenchEntryPrompt: InputbarPresentationParams["generalWorkbenchEntryPrompt"];
  handleRestartGeneralWorkbenchEntryPrompt: InputbarPresentationParams["onRestartGeneralWorkbenchEntryPrompt"];
  handleContinueGeneralWorkbenchEntryPrompt: InputbarPresentationParams["onContinueGeneralWorkbenchEntryPrompt"];
  planDecisionAccessory?: InputbarPresentationParams["planDecisionAccessory"];
  generalWorkbenchEnabled: boolean;
  harnessPanelVisible: GeneralWorkbenchDialogParams["open"];
  setHarnessPanelVisible: GeneralWorkbenchDialogParams["onOpenChange"];
  harnessState: GeneralWorkbenchDialogParams["harnessState"];
  harnessEnvironment: GeneralWorkbenchDialogParams["environment"];
  toolInventory: GeneralWorkbenchDialogParams["toolInventory"];
  toolInventoryLoading: GeneralWorkbenchDialogParams["toolInventoryLoading"];
  toolInventoryError: GeneralWorkbenchDialogParams["toolInventoryError"];
  refreshToolInventory: GeneralWorkbenchDialogParams["onRefreshToolInventory"];
  mappedTheme: GeneralWorkbenchDialogParams["activeTheme"];
  activeRuntimeStatusTitle: GeneralWorkbenchDialogParams["runtimeStatusTitle"];
  handleHarnessLoadFilePreview: GeneralWorkbenchDialogParams["onLoadFilePreview"];
  handleFileClick: GeneralWorkbenchDialogParams["onOpenFile"];
  chatToolPreferences?: ChatToolPreferences;
  defaultCuratedTaskReferenceMemoryIds?: string[];
  defaultCuratedTaskReferenceEntries?: CuratedTaskReferenceEntry[];
  pathReferences: InputbarParams["pathReferences"];
  onAddPathReferences: InputbarParams["onAddPathReferences"];
  onRemovePathReference: InputbarParams["onRemovePathReference"];
  onClearPathReferences: InputbarParams["onClearPathReferences"];
  fileManagerOpen: InputbarParams["fileManagerOpen"];
  onToggleFileManager: InputbarParams["onToggleFileManager"];
  inputCompletionEnabled?: boolean;
}

export function useWorkspaceInputbarSceneRuntime({
  contextVariant = "default",
  setMentionedCharacters,
  isThemeWorkbench,
  sessionId,
  childSubagentSessions,
  selectedTeamLabel,
  selectedTeamSummary,
  teamMemorySnapshot,
  currentSessionTitle,
  handleStopSending,
  handleOpenSubagentSession,
  input,
  setInput,
  currentGate,
  generalWorkbenchWorkflowSteps,
  steps,
  workflowRunState,
  handleSend,
  isPreparingSend,
  isSending,
  isSessionRestoring = false,
  providerType,
  setProviderType,
  model,
  setModel,
  reasoningEffort,
  setReasoningEffort,
  sessionExecutionRuntime,
  projectId,
  openedProjects,
  projectRootPath,
  accessMode,
  setAccessMode,
  activeTheme,
  navigationActions,
  selectedTeam,
  characters,
  skills,
  serviceSkills,
  serviceSkillGroups,
  skillsLoading,
  onSelectServiceSkill,
  onSkillSuggestionsNeeded,
  initialInputCapability,
  initialKnowledgePackSelection,
  pluginSuggestions,
  pluginSuggestionsError,
  pluginSuggestionsLoading,
  onPluginSuggestionsNeeded,
  setChatToolPreferences,
  objectiveEnabled = false,
  onObjectiveEnabledChange,
  handleNavigateToSkillSettings,
  handleRefreshSkills,
  soulArtifactVoiceGenerationBrief,
  soulArtifactVoiceEnabledForTurn,
  onSoulArtifactVoiceEnabledForTurnChange,
  turns,
  threadItems,
  currentTurnId,
  threadRead,
  activeExecutionRuntime,
  pendingActions,
  submittedActionsInFlight,
  onRespondToAction,
  messages,
  queuedTurns,
  resumeThread,
  replayPendingAction,
  promoteQueuedTurn,
  onObjectiveChanged,
  removeQueuedTurn,
  latestAssistantMessageId,
  sessionIdForDiagnostics,
  generalWorkbenchEntryPrompt,
  handleRestartGeneralWorkbenchEntryPrompt,
  handleContinueGeneralWorkbenchEntryPrompt,
  planDecisionAccessory,
  generalWorkbenchEnabled,
  harnessPanelVisible,
  setHarnessPanelVisible,
  harnessState,
  harnessEnvironment,
  toolInventory,
  toolInventoryLoading,
  toolInventoryError,
  refreshToolInventory,
  mappedTheme,
  activeRuntimeStatusTitle,
  handleHarnessLoadFilePreview,
  handleFileClick,
  chatToolPreferences,
  defaultCuratedTaskReferenceMemoryIds = [],
  defaultCuratedTaskReferenceEntries = [],
  pathReferences,
  onAddPathReferences,
  onRemovePathReference,
  onClearPathReferences,
  fileManagerOpen,
  onToggleFileManager,
  inputCompletionEnabled = true,
}: UseWorkspaceInputbarSceneRuntimeParams) {
  const resolvedQueuedTurns = useMemo(() => queuedTurns ?? [], [queuedTurns]);
  const knowledgeRuntime = useWorkspaceKnowledgeRuntime({
    projectRootPath,
    currentSessionTitle,
    input,
    setInput,
    handleSend,
    onOpenKnowledgeManagement: navigationActions.handleOpenKnowledgeManagement,
    initialKnowledgePackSelection,
  });
  const resolvedChatToolPreferences =
    chatToolPreferences ?? DEFAULT_CHAT_TOOL_PREFERENCES;
  const runtimeToolAvailability = useMemo(
    () => deriveRuntimeToolAvailability(toolInventory),
    [toolInventory],
  );
  const handleInputbarSend = useCallback<InputbarSendHandler>(
    (payload = {}) =>
      handleSend(
        payload.images,
        undefined,
        undefined,
        payload.textOverride,
        "react",
        payload.autoContinuePayload,
        payload.sendOptions,
      ),
    [handleSend],
  );
  const handleSubmitCodeFixPrompt = useCallback(
    async (prompt: string) => {
      const normalizedPrompt = prompt.trim();
      if (!normalizedPrompt) {
        return;
      }

      await handleInputbarSend({
        textOverride: normalizedPrompt,
        sendOptions: {
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
      });
    },
    [handleInputbarSend],
  );
  const handleInputbarToolStatesChange = useCallback(
    (nextToolStates: WorkspaceInputbarToolStates) => {
      const hasPlanChange = typeof nextToolStates.plan === "boolean";
      const hasSubagentChange = typeof nextToolStates.subagent === "boolean";
      const hasObjectiveChange = typeof nextToolStates.objective === "boolean";
      if (!hasPlanChange && !hasSubagentChange && !hasObjectiveChange) {
        return;
      }

      if (hasPlanChange || hasSubagentChange) {
        setChatToolPreferences((previous) => ({
          ...previous,
          ...(hasPlanChange ? { task: nextToolStates.plan } : {}),
          ...(hasSubagentChange ? { subagent: nextToolStates.subagent } : {}),
        }));
      }
      if (hasObjectiveChange) {
        onObjectiveEnabledChange?.(nextToolStates.objective === true);
      }
    },
    [onObjectiveEnabledChange, setChatToolPreferences],
  );
  const resolvedTurns = useMemo(() => turns ?? [], [turns]);
  const latestTurnPrompt =
    resolvedTurns
      .find((turn) => turn.id === currentTurnId)
      ?.prompt_text?.trim() ||
    resolvedTurns[resolvedTurns.length - 1]?.prompt_text?.trim() ||
    "";

  const presentationRuntime = useWorkspaceInputbarScenePresentationRuntime({
    setMentionedCharacters,
    isThemeWorkbench,
    inputbarPresentation: {
      inputbar: {
        input,
        setInput,
        contextVariant,
        variant: isThemeWorkbench ? "workspace" : "default",
        projectId,
        openedProjects,
        onProjectContextChange: navigationActions.handleProjectChange,
        sessionId,
        workflowGate: isThemeWorkbench ? currentGate : null,
        workflowSteps: isThemeWorkbench ? generalWorkbenchWorkflowSteps : steps,
        workflowRunState,
        onSend: handleInputbarSend,
        onStop: handleStopSending,
        isLoading: isSending || resolvedQueuedTurns.length > 0,
        knowledgePackSelection: knowledgeRuntime.knowledgePackSelection,
        knowledgePackOptions: knowledgeRuntime.knowledgePackOptions,
        onKnowledgePacksNeeded: knowledgeRuntime.onKnowledgePacksNeeded,
        onToggleKnowledgePack: knowledgeRuntime.onToggleKnowledgePack,
        onSelectKnowledgePack: knowledgeRuntime.onSelectKnowledgePack,
        onToggleKnowledgeCompanionPack:
          knowledgeRuntime.onToggleKnowledgeCompanionPack,
        onStartKnowledgeOrganize: knowledgeRuntime.onStartKnowledgeOrganize,
        onManageKnowledgePacks: knowledgeRuntime.onManageKnowledgePacks,
        providerType,
        setProviderType,
        model,
        setModel,
        reasoningEffort,
        setReasoningEffort,
        executionRuntime: sessionExecutionRuntime,
        accessMode,
        setAccessMode,
        activeTheme,
        onManageProviders: navigationActions.handleManageProviders,
        disabled:
          isSessionRestoring ||
          isPreparingSend ||
          (contextVariant !== "task-center" && !projectId && !sessionId),
        characters,
        skills,
        serviceSkills,
        serviceSkillGroups,
        isSkillsLoading: skillsLoading,
        onSelectServiceSkill,
        onSkillSuggestionsNeeded,
        initialInputCapability,
        pluginSuggestions,
        pluginSuggestionsError,
        pluginSuggestionsLoading,
        onPluginSuggestionsNeeded,
        toolStates: {
          objective: objectiveEnabled,
          plan: resolvedChatToolPreferences.task,
          subagent: resolvedChatToolPreferences.subagent,
        },
        onToolStatesChange: handleInputbarToolStatesChange,
        onNavigateToSettings: handleNavigateToSkillSettings,
        onRefreshSkills: handleRefreshSkills,
        queuedTurns: resolvedQueuedTurns,
        onPromoteQueuedTurn: promoteQueuedTurn
          ? async (queuedTurnId: string) => {
              return Boolean(await promoteQueuedTurn(queuedTurnId));
            }
          : undefined,
        onRemoveQueuedTurn: removeQueuedTurn,
        defaultCuratedTaskReferenceMemoryIds,
        defaultCuratedTaskReferenceEntries,
        pathReferences,
        onAddPathReferences,
        onImportPathReferenceAsKnowledge:
          knowledgeRuntime.onImportPathReferenceAsKnowledge,
        onRemovePathReference,
        onClearPathReferences,
        fileManagerOpen,
        onToggleFileManager,
        inputCompletionEnabled,
      },
      generalWorkbenchEntryPrompt,
      onRestartGeneralWorkbenchEntryPrompt:
        handleRestartGeneralWorkbenchEntryPrompt,
      onContinueGeneralWorkbenchEntryPrompt:
        handleContinueGeneralWorkbenchEntryPrompt,
      planDecisionAccessory,
      soulArtifactVoiceGenerationBrief,
      soulArtifactVoiceEnabledForTurn,
      onSoulArtifactVoiceEnabledForTurnChange,
      generalWorkbenchDialog: {
        enabled: generalWorkbenchEnabled && !isThemeWorkbench,
        open: harnessPanelVisible,
        onOpenChange: setHarnessPanelVisible,
        harnessState,
        environment: harnessEnvironment,
        childSubagentSessions,
        selectedTeamLabel,
        selectedTeamSummary,
        selectedTeamRoles: selectedTeam?.roles,
        teamMemorySnapshot,
        threadRead,
        turns,
        threadItems,
        currentTurnId,
        pendingActions,
        submittedActionsInFlight,
        onRespondToAction,
        messages,
        queuedTurns: resolvedQueuedTurns,
        canInterrupt: isSending,
        onInterruptCurrentTurn: handleStopSending,
        onResumeThread: resumeThread,
        onReplayPendingRequest:
          latestAssistantMessageId && replayPendingAction
            ? (requestId: string) =>
                replayPendingAction(requestId, latestAssistantMessageId)
            : undefined,
        onPromoteQueuedTurn: promoteQueuedTurn,
        onObjectiveChanged,
        onManageProviders: navigationActions.handleManageProviders,
        onOpenExecutionPolicySettings:
          navigationActions.handleOpenExecutionPolicySettings,
        onOpenMemoryWorkbench:
          sessionIdForDiagnostics && projectRootPath
            ? () =>
                navigationActions.handleOpenRuntimeMemoryWorkbench({
                  sessionId: sessionIdForDiagnostics,
                  workingDir: projectRootPath,
                  userMessage: latestTurnPrompt,
                })
            : undefined,
        diagnosticRuntimeContext: {
          sessionId: sessionIdForDiagnostics,
          workspaceId: projectId,
          workingDir: projectRootPath || null,
          providerType:
            activeExecutionRuntime?.provider_selector || providerType || null,
          model: activeExecutionRuntime?.model_name || model || null,
          executionStrategy: "react",
          activeTheme: activeTheme || null,
          selectedTeamLabel: selectedTeamLabel || null,
        },
        toolInventory,
        toolInventoryLoading,
        toolInventoryError,
        onRefreshToolInventory: refreshToolInventory,
        activeTheme: mappedTheme,
        toolPreferences: resolvedChatToolPreferences,
        runtimeToolAvailability,
        isSending,
        executionRuntime: sessionExecutionRuntime,
        isExecutionRuntimeActive: Boolean(activeExecutionRuntime),
        runtimeStatusTitle: activeRuntimeStatusTitle,
        selectedTeamRoleCount: selectedTeam?.roles.length || 0,
        onOpenSubagentSession: handleOpenSubagentSession,
        onLoadFilePreview: handleHarnessLoadFilePreview,
        onOpenFile: handleFileClick,
        onSubmitCodeFixPrompt: handleSubmitCodeFixPrompt,
      },
    },
  });

  return {
    ...presentationRuntime,
    knowledgePackSelection: knowledgeRuntime.knowledgePackSelection,
    knowledgePackOptions: knowledgeRuntime.knowledgePackOptions,
    onToggleKnowledgePack: knowledgeRuntime.onToggleKnowledgePack,
    onSelectKnowledgePack: knowledgeRuntime.onSelectKnowledgePack,
    onToggleKnowledgeCompanionPack:
      knowledgeRuntime.onToggleKnowledgeCompanionPack,
    onKnowledgePacksNeeded: knowledgeRuntime.onKnowledgePacksNeeded,
    onStartKnowledgeOrganize: knowledgeRuntime.onStartKnowledgeOrganize,
    onManageKnowledgePacks: knowledgeRuntime.onManageKnowledgePacks,
    onImportPathReferenceAsKnowledge:
      knowledgeRuntime.onImportPathReferenceAsKnowledge,
    onImportTextAsKnowledge: knowledgeRuntime.onImportTextAsKnowledge,
  };
}
