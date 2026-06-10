import React, { useState } from "react";
import { FolderOpen } from "lucide-react";
import type { ChatInputAdapter } from "@/components/input-kit/adapters/types";
import type { Character } from "@/lib/api/memory";
import type {
  AsterSessionExecutionRuntime,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import type { MessageImage, MessagePathReference } from "../../../types";
import { CharacterMention } from "../../../skill-selection/CharacterMention";
import { InputbarCore } from "./InputbarCore";
import { SkillSelector } from "../../../skill-selection/SkillSelector";
import { TeamSelector } from "./TeamSelector";
import { InputbarWorkflowStatusPanel } from "./InputbarWorkflowStatusPanel";
import { InputbarModelExtra } from "./InputbarModelExtra";
import { InputbarVisionCapabilityNotice } from "./InputbarVisionCapabilityNotice";
import { InputbarAccessModeSelect } from "./InputbarAccessModeSelect";
import { InputbarModeStatusChip } from "./InputbarModeStatusChip";
import { isGeneralResearchTheme } from "../../../utils/generalAgentPrompt";
import type { TeamDefinition } from "../../../utils/teamDefinitions";
import type { WorkspaceSettings } from "@/types/workspace";
import {
  buildSkillSelectionBindings,
  type SkillSelectionProps,
} from "../../../skill-selection/skillSelectionBindings";
import type {
  InputCapabilitySelection,
  SelectInputCapabilityHandler,
} from "../../../skill-selection/inputCapabilitySelection";
import type { AgentAccessMode } from "../../../hooks/agentChatStorage";
import type { CuratedTaskReferenceEntry } from "../../../utils/curatedTaskReferenceSelection";
import type {
  InputbarKnowledgePackOption,
  InputbarKnowledgePackSelection,
} from "../types";
import { InputbarKnowledgeControl } from "../knowledge/InputbarKnowledgeControl";
import type { InputbarComposerSectionCopy } from "./inputbarComposerSectionCopy";
import type { InputbarCoreCopy } from "./inputbarCoreCopy";
import type { InputbarWorkflowPanelCopy } from "../inputbarWorkflowCopy";
import type {
  WorkflowGateState,
  WorkflowQuickAction,
  WorkflowStep,
} from "../../../utils/workflowInputState";
import { MetaIconButton } from "../styles";
import type { ModelReasoningEffortLevel } from "@/lib/types/modelRegistry";

interface InputbarComposerSectionProps {
  renderWorkflowGeneratingPanel: boolean;
  workflowGate?: WorkflowGateState | null;
  workflowQuickActions: WorkflowQuickAction[];
  workflowQueueItems: WorkflowStep[];
  workflowActiveItem: WorkflowStep | null;
  workflowQueueTotalCount: number;
  workflowCompletedCount: number;
  workflowTotalCount: number;
  workflowProgressLabel: string;
  workflowSummaryLabel: string;
  inputAdapter: ChatInputAdapter;
  characters: Character[];
  skillSelection: SkillSelectionProps;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  input: string;
  onSelectCharacter?: (character: Character) => void;
  onSelectInputCapability: SelectInputCapabilityHandler;
  activeCapability?: InputCapabilitySelection | null;
  defaultCuratedTaskReferenceMemoryIds?: string[];
  defaultCuratedTaskReferenceEntries?: CuratedTaskReferenceEntry[];
  selectedTeam?: TeamDefinition | null;
  knowledgePackSelection?: InputbarKnowledgePackSelection | null;
  knowledgePackOptions?: InputbarKnowledgePackOption[];
  knowledgeHubOpenRequestKey?: number;
  onToggleKnowledgePack?: (enabled: boolean) => void;
  onSelectKnowledgePack?: (packName: string) => void;
  onToggleKnowledgeCompanionPack?: (packName: string, enabled: boolean) => void;
  onStartKnowledgeOrganize?: () => void;
  onManageKnowledgePacks?: () => void;
  onSelectTeam?: (team: TeamDefinition | null) => void;
  teamWorkspaceSettings?: WorkspaceSettings | null;
  onPersistCustomTeams?: (teams: TeamDefinition[]) => void | Promise<void>;
  onSend: () => void;
  onToolClick: (tool: string) => void;
  activeTools: Record<string, boolean>;
  pendingImages: MessageImage[];
  onRemoveImage: (index: number) => void;
  pathReferences?: MessagePathReference[];
  onImportPathReferenceAsKnowledge?: (reference: MessagePathReference) => void;
  onRemovePathReference?: (id: string) => void;
  fileManagerOpen?: boolean;
  onToggleFileManager?: () => void;
  onPaste: (event: React.ClipboardEvent) => void;
  isFullscreen: boolean;
  isWorkspaceVariant: boolean;
  activeTheme?: string;
  onManageProviders?: () => void;
  reasoningEffort?: ModelReasoningEffortLevel | "";
  setReasoningEffort?: (value: ModelReasoningEffortLevel | "") => void;
  executionRuntime?: AsterSessionExecutionRuntime | null;
  accessMode?: AgentAccessMode;
  setAccessMode?: (mode: AgentAccessMode) => void;
  showModelControls?: boolean;
  topExtra?: React.ReactNode;
  queuedTurns: QueuedTurnSnapshot[];
  onPromoteQueuedTurn?: (queuedTurnId: string) => void | Promise<boolean>;
  onRemoveQueuedTurn?: (queuedTurnId: string) => void | Promise<boolean>;
  contextVariant?: "default" | "task-center";
  projectId?: string | null;
  sessionId?: string | null;
  inputCompletionEnabled?: boolean;
  copy: InputbarComposerSectionCopy;
  inputbarCopy: InputbarCoreCopy;
  workflowPanelCopy: InputbarWorkflowPanelCopy;
}

export const InputbarComposerSection: React.FC<
  InputbarComposerSectionProps
> = ({
  renderWorkflowGeneratingPanel,
  workflowGate,
  workflowQuickActions,
  workflowQueueItems,
  workflowActiveItem,
  workflowQueueTotalCount,
  workflowCompletedCount,
  workflowTotalCount,
  workflowProgressLabel,
  workflowSummaryLabel,
  inputAdapter,
  characters,
  skillSelection,
  textareaRef,
  input,
  onSelectCharacter,
  onSelectInputCapability,
  activeCapability,
  defaultCuratedTaskReferenceMemoryIds = [],
  defaultCuratedTaskReferenceEntries = [],
  selectedTeam,
  knowledgePackSelection,
  knowledgePackOptions = [],
  knowledgeHubOpenRequestKey,
  onToggleKnowledgePack,
  onSelectKnowledgePack,
  onToggleKnowledgeCompanionPack,
  onStartKnowledgeOrganize,
  onManageKnowledgePacks,
  onSelectTeam,
  teamWorkspaceSettings,
  onPersistCustomTeams,
  onSend,
  onToolClick,
  activeTools,
  pendingImages,
  onRemoveImage,
  pathReferences = [],
  onImportPathReferenceAsKnowledge,
  onRemovePathReference,
  fileManagerOpen = false,
  onToggleFileManager,
  onPaste,
  isFullscreen,
  isWorkspaceVariant,
  activeTheme,
  onManageProviders,
  reasoningEffort,
  setReasoningEffort,
  executionRuntime,
  accessMode,
  setAccessMode,
  showModelControls = false,
  topExtra,
  queuedTurns,
  onPromoteQueuedTurn,
  onRemoveQueuedTurn,
  contextVariant = "default",
  projectId = null,
  sessionId = null,
  inputCompletionEnabled = true,
  copy,
  inputbarCopy,
  workflowPanelCopy,
}) => {
  const [teamSelectorAutoOpenToken, setTeamSelectorAutoOpenToken] = useState<
    number | null
  >(null);
  const showSkillSelector = isGeneralResearchTheme(activeTheme);
  const currentPendingImages =
    (inputAdapter.state.attachments as MessageImage[] | undefined) ||
    pendingImages;
  const { mentionProps: mentionSkillProps, selectorProps: skillSelectorProps } =
    buildSkillSelectionBindings(skillSelection);
  const resolvedProviderType = inputAdapter.model?.providerType;
  const resolvedModel = inputAdapter.model?.model;
  const resolvedReasoningEffort =
    inputAdapter.model?.reasoningEffort ?? reasoningEffort ?? "";
  const shouldShowModelControls = showModelControls;
  const resolvedSetProviderType =
    inputAdapter.actions.setProviderType || (() => undefined);
  const resolvedSetModel = inputAdapter.actions.setModel || (() => undefined);
  const resolvedSetReasoningEffort =
    inputAdapter.actions.setReasoningEffort || setReasoningEffort;
  const shouldShowVisionNotice =
    currentPendingImages.length > 0 &&
    Boolean(resolvedProviderType?.trim()) &&
    Boolean(resolvedModel?.trim());
  const resolvedTopExtra =
    topExtra || shouldShowVisionNotice ? (
      <>
        {topExtra}
        {shouldShowVisionNotice && resolvedProviderType && resolvedModel ? (
          <InputbarVisionCapabilityNotice
            providerType={resolvedProviderType}
            model={resolvedModel}
            hasPendingImages={currentPendingImages.length > 0}
          />
        ) : null}
      </>
    ) : undefined;
  const handleToolAction = (tool: string) => {
    if (
      tool === "subagent_mode" &&
      !activeTools["subagent_mode"] &&
      !selectedTeam
    ) {
      setTeamSelectorAutoOpenToken((current) => (current ?? 0) + 1);
    }
    onToolClick(tool);
  };
  const shouldShowTeamSelector =
    isGeneralResearchTheme(activeTheme) && activeTools["subagent_mode"];
  const planModeStatusLabel = copy.plusMenu.planMode
    .replace(/模式$/, "")
    .replace(/ mode$/i, "");
  const objectiveStatusLabel = copy.plusMenu.objective;
  const plusMenuKnowledgePanel =
    knowledgePackSelection || onStartKnowledgeOrganize ? (
      <InputbarKnowledgeControl
        renderMode="inline"
        knowledgePackSelection={knowledgePackSelection}
        knowledgePackOptions={knowledgePackOptions}
        inputText={input}
        openKnowledgeHubRequestKey={knowledgeHubOpenRequestKey}
        onToggleKnowledgePack={onToggleKnowledgePack}
        onSelectKnowledgePack={onSelectKnowledgePack}
        onToggleKnowledgeCompanionPack={onToggleKnowledgeCompanionPack}
        onStartKnowledgeOrganize={onStartKnowledgeOrganize}
        onManageKnowledgePacks={onManageKnowledgePacks}
      />
    ) : undefined;
  const plusMenuSkillsPanel = showSkillSelector ? (
    <SkillSelector {...skillSelectorProps} renderMode="inline" />
  ) : undefined;
  const fileManagerLabel = fileManagerOpen
    ? copy.fileManager.close
    : copy.fileManager.open;
  const workspacePlaceholder =
    workflowGate?.status === "waiting"
      ? copy.workspacePlaceholder.waiting
      : contextVariant === "task-center"
        ? copy.workspacePlaceholder.taskCenter
        : copy.workspacePlaceholder.default;
  const plusMenu = {
    labels: copy.plusMenu,
    taskEnabled: Boolean(activeTools["task_mode"]),
    knowledgeOpenRequestKey: knowledgeHubOpenRequestKey,
    subagentEnabled: Boolean(activeTools["subagent_mode"]),
    knowledgeActive: Boolean(knowledgePackSelection?.enabled),
    objectiveActive: Boolean(activeTools["objective_mode"]),
    skillsActive: Boolean(skillSelection.activeSkill),
    knowledgePanel: plusMenuKnowledgePanel,
    skillsPanel: plusMenuSkillsPanel,
    onAddFiles: () => handleToolAction("attach"),
    onToggleTask: () => handleToolAction("task_mode"),
    onToggleObjective: () => handleToolAction("objective_mode"),
    onToggleSubagent: showSkillSelector
      ? () => handleToolAction("subagent_mode")
      : undefined,
  };
  const shouldShowLeftExtra =
    Boolean(activeTools["task_mode"]) ||
    Boolean(activeTools["objective_mode"]) ||
    Boolean(setAccessMode) ||
    Boolean(onToggleFileManager) ||
    shouldShowTeamSelector;
  const leftExtra = shouldShowLeftExtra ? (
    <>
      <InputbarAccessModeSelect
        isFullscreen={isFullscreen}
        accessMode={accessMode}
        setAccessMode={setAccessMode}
      />

      {activeTools["task_mode"] ? (
        <InputbarModeStatusChip
          label={planModeStatusLabel}
          testId="inputbar-task-mode-status"
          onRemove={() => handleToolAction("task_mode")}
        />
      ) : null}

      {activeTools["objective_mode"] ? (
        <InputbarModeStatusChip
          label={objectiveStatusLabel}
          testId="inputbar-objective-status"
          onRemove={() => handleToolAction("objective_mode")}
        />
      ) : null}

      {shouldShowTeamSelector ? (
        <TeamSelector
          activeTheme={activeTheme}
          input={input}
          autoOpenToken={teamSelectorAutoOpenToken}
          selectedTeam={selectedTeam}
          workspaceSettings={teamWorkspaceSettings}
          onPersistCustomTeams={onPersistCustomTeams}
          onSelectTeam={(team) => onSelectTeam?.(team)}
        />
      ) : null}

      {onToggleFileManager ? (
        <MetaIconButton
          type="button"
          $active={fileManagerOpen}
          aria-label={fileManagerLabel}
          title={fileManagerLabel}
          data-testid="inputbar-file-manager-toggle"
          onClick={onToggleFileManager}
        >
          <FolderOpen className="h-4 w-4" aria-hidden />
        </MetaIconButton>
      ) : null}
    </>
  ) : undefined;
  const trailingMeta = shouldShowModelControls ? (
    <InputbarModelExtra
      isFullscreen={isFullscreen}
      providerType={resolvedProviderType}
      setProviderType={resolvedSetProviderType}
      model={resolvedModel}
      setModel={resolvedSetModel}
      reasoningEffort={resolvedReasoningEffort}
      setReasoningEffort={resolvedSetReasoningEffort}
      activeTheme={activeTheme}
      onManageProviders={onManageProviders}
      executionRuntime={executionRuntime}
    />
  ) : undefined;

  if (renderWorkflowGeneratingPanel) {
    return (
      <InputbarWorkflowStatusPanel
        gate={workflowGate}
        quickActions={workflowQuickActions}
        queueItems={workflowQueueItems}
        activeItem={workflowActiveItem}
        queueTotalCount={workflowQueueTotalCount}
        completedCount={workflowCompletedCount}
        totalCount={workflowTotalCount}
        progressLabel={workflowProgressLabel}
        summaryLabel={workflowSummaryLabel}
        renderGeneratingPanel
        onQuickAction={inputAdapter.actions.setText}
        onStop={inputAdapter.actions.stop}
        copy={workflowPanelCopy}
      />
    );
  }

  return (
    <>
      <InputbarWorkflowStatusPanel
        gate={workflowGate}
        quickActions={workflowQuickActions}
        queueItems={workflowQueueItems}
        activeItem={workflowActiveItem}
        queueTotalCount={workflowQueueTotalCount}
        completedCount={workflowCompletedCount}
        totalCount={workflowTotalCount}
        progressLabel={workflowProgressLabel}
        summaryLabel={workflowSummaryLabel}
        renderGeneratingPanel={false}
        onQuickAction={inputAdapter.actions.setText}
        onStop={inputAdapter.actions.stop}
        copy={workflowPanelCopy}
      />
      <CharacterMention
        {...mentionSkillProps}
        characters={characters}
        inputRef={textareaRef}
        value={input}
        onChange={inputAdapter.actions.setText}
        onSelectCharacter={onSelectCharacter}
        onSelectInputCapability={onSelectInputCapability}
        projectId={projectId}
        sessionId={sessionId}
        defaultCuratedTaskReferenceMemoryIds={
          activeCapability?.kind === "curated_task"
            ? activeCapability.referenceMemoryIds ||
              defaultCuratedTaskReferenceMemoryIds
            : defaultCuratedTaskReferenceMemoryIds
        }
        defaultCuratedTaskReferenceEntries={
          activeCapability?.kind === "curated_task"
            ? activeCapability.referenceEntries ||
              defaultCuratedTaskReferenceEntries
            : defaultCuratedTaskReferenceEntries
        }
        inputCompletionEnabled={inputCompletionEnabled}
      />
      <InputbarCore
        uiCopy={inputbarCopy}
        textareaRef={textareaRef}
        text={inputAdapter.state.text}
        setText={inputAdapter.actions.setText}
        onSend={onSend}
        onStop={inputAdapter.actions.stop}
        isLoading={inputAdapter.state.isSending}
        disabled={inputAdapter.state.disabled}
        onToolClick={handleToolAction}
        activeTools={activeTools}
        pendingImages={currentPendingImages}
        onRemoveImage={onRemoveImage}
        pathReferences={pathReferences}
        onImportPathReferenceAsKnowledge={onImportPathReferenceAsKnowledge}
        onRemovePathReference={onRemovePathReference}
        onPaste={onPaste}
        isFullscreen={isFullscreen}
        placeholder={isWorkspaceVariant ? workspacePlaceholder : undefined}
        toolMode={isWorkspaceVariant ? "attach-only" : "default"}
        showDragHandle={!isWorkspaceVariant}
        visualVariant={isWorkspaceVariant ? "floating" : "default"}
        topExtra={resolvedTopExtra}
        activeTheme={activeTheme}
        queuedTurns={queuedTurns}
        onPromoteQueuedTurn={onPromoteQueuedTurn}
        onRemoveQueuedTurn={onRemoveQueuedTurn}
        leftExtra={leftExtra}
        trailingMeta={trailingMeta}
        showMetaTools={false}
        plusMenu={plusMenu}
      />
    </>
  );
};
