import { toast } from "sonner";
import type {
  AgentUiProjectionSummary,
  AgentUiProjectionTranslation,
} from "../projection/agentUiProjectionSummary";
import type { buildThreadReliabilityView } from "../utils/threadReliabilityView";
import type { ActionRequired } from "../types";
import type { TranslationFunction } from "./HarnessActivityTypes";
import type { HarnessStatusPanelProps } from "./HarnessStatusPanelTypes";
import type { AgentTranslation } from "./HarnessStatusPanelPrimitives";
import type { HarnessStatusPanelSectionsProps } from "./HarnessStatusPanelSections";
import type { useHarnessActivityModel } from "./useHarnessActivityModel";
import type { useHarnessFileReviewState } from "./useHarnessFileReviewState";
import type { useHarnessHandoffExports } from "./useHarnessHandoffExports";
import type { useHarnessPreviewDialog } from "./useHarnessPreviewDialog";
import type { useHarnessToolInventoryModel } from "./useHarnessToolInventoryModel";
import type {
  ChildSubagentSessionSummary,
  HarnessRuntimeFactSummary,
  RuntimeTaskPresentation,
} from "./harnessStatusPanelViewModel";

type ActivityModel = ReturnType<typeof useHarnessActivityModel>;
type FileReviewState = ReturnType<typeof useHarnessFileReviewState>;
type HandoffExports = ReturnType<typeof useHarnessHandoffExports>;
type PreviewModel = ReturnType<typeof useHarnessPreviewDialog>;
type ToolInventoryModel = ReturnType<typeof useHarnessToolInventoryModel>;
type ThreadReliabilityView = ReturnType<typeof buildThreadReliabilityView>;

interface BuildHarnessStatusPanelSectionModelsInput {
  activityModel: ActivityModel;
  agentUiProjectionSummary: AgentUiProjectionSummary;
  canInterrupt: boolean;
  childSubagentSessions: NonNullable<
    HarnessStatusPanelProps["childSubagentSessions"]
  >;
  currentSessionId: string | null;
  currentTurnId: HarnessStatusPanelProps["currentTurnId"];
  diagnosticRuntimeContext: HarnessStatusPanelProps["diagnosticRuntimeContext"];
  environment: HarnessStatusPanelProps["environment"];
  fileReviewState: FileReviewState;
  handleApprovalResponse: (
    item: ActionRequired,
    confirmed: boolean,
  ) => void | Promise<void>;
  handleOpenExternalLink: (url: string) => void | Promise<void>;
  handoffExports: HandoffExports;
  hasAgentUiProjectionSection: boolean;
  hasHandoffSection: boolean;
  hasSelectedTeamConfig: boolean;
  harnessState: HarnessStatusPanelProps["harnessState"];
  messages: NonNullable<HarnessStatusPanelProps["messages"]>;
  onInterruptCurrentTurn: HarnessStatusPanelProps["onInterruptCurrentTurn"];
  onObjectiveChanged: HarnessStatusPanelProps["onObjectiveChanged"];
  onManageProviders: HarnessStatusPanelProps["onManageProviders"];
  onOpenExecutionPolicySettings: HarnessStatusPanelProps["onOpenExecutionPolicySettings"];
  onOpenFileCheckpoints: HarnessStatusPanelProps["onOpenFileCheckpoints"];
  onOpenSubagentSession: HarnessStatusPanelProps["onOpenSubagentSession"];
  onPromoteQueuedTurn: HarnessStatusPanelProps["onPromoteQueuedTurn"];
  onRefreshToolInventory: HarnessStatusPanelProps["onRefreshToolInventory"];
  onReplayPendingRequest: HarnessStatusPanelProps["onReplayPendingRequest"];
  onRespondToAction: HarnessStatusPanelProps["onRespondToAction"];
  onResumeThread: HarnessStatusPanelProps["onResumeThread"];
  pendingActions: NonNullable<HarnessStatusPanelProps["pendingActions"]>;
  previewModel: PreviewModel;
  queuedTurns: NonNullable<HarnessStatusPanelProps["queuedTurns"]>;
  realTeamSummary: ChildSubagentSessionSummary;
  registerSectionRef: HarnessStatusPanelSectionsProps["registerSectionRef"];
  runtimeFactSummary: HarnessRuntimeFactSummary | null;
  runtimeTaskPresentation: RuntimeTaskPresentation | null;
  selectedTeamLabel: HarnessStatusPanelProps["selectedTeamLabel"];
  selectedTeamRoles: HarnessStatusPanelProps["selectedTeamRoles"];
  selectedTeamSummary: HarnessStatusPanelProps["selectedTeamSummary"];
  submittedActionIds: ReadonlySet<string>;
  submittedActionsInFlight: NonNullable<
    HarnessStatusPanelProps["submittedActionsInFlight"]
  >;
  t: TranslationFunction;
  threadItems: NonNullable<HarnessStatusPanelProps["threadItems"]>;
  threadRead: HarnessStatusPanelProps["threadRead"];
  threadReliabilityView: ThreadReliabilityView;
  toolInventory: HarnessStatusPanelProps["toolInventory"];
  toolInventoryError: string | null;
  toolInventoryLoading: boolean;
  toolInventoryModel: ToolInventoryModel;
  translateAgent: AgentTranslation;
  translateProjection: AgentUiProjectionTranslation;
  turns: NonNullable<HarnessStatusPanelProps["turns"]>;
}

export function buildHarnessStatusPanelSectionModels({
  activityModel,
  agentUiProjectionSummary,
  canInterrupt,
  childSubagentSessions,
  currentSessionId,
  currentTurnId,
  diagnosticRuntimeContext,
  environment,
  fileReviewState,
  handleApprovalResponse,
  handleOpenExternalLink,
  handoffExports,
  hasAgentUiProjectionSection,
  hasHandoffSection,
  hasSelectedTeamConfig,
  harnessState,
  messages,
  onInterruptCurrentTurn,
  onObjectiveChanged,
  onManageProviders,
  onOpenExecutionPolicySettings,
  onOpenFileCheckpoints,
  onOpenSubagentSession,
  onPromoteQueuedTurn,
  onRefreshToolInventory,
  onReplayPendingRequest,
  onRespondToAction,
  onResumeThread,
  pendingActions,
  previewModel,
  queuedTurns,
  realTeamSummary,
  registerSectionRef,
  runtimeFactSummary,
  runtimeTaskPresentation,
  selectedTeamLabel,
  selectedTeamRoles,
  selectedTeamSummary,
  submittedActionIds,
  submittedActionsInFlight,
  t,
  threadItems,
  threadRead,
  threadReliabilityView,
  toolInventory,
  toolInventoryError,
  toolInventoryLoading,
  toolInventoryModel,
  translateAgent,
  translateProjection,
  turns,
}: BuildHarnessStatusPanelSectionModelsInput): HarnessStatusPanelSectionsProps {
  const {
    fileDisplayMode,
    fileFilter,
    fileFilterOptions,
    filteredFileEvents,
    filteredOutputSignals,
    groupedFileEvents,
    groupedOutputEntries,
    outputFilter,
    outputFilterOptions,
    setFileDisplayMode,
    setFileFilter,
    setOutputFilter,
  } = activityModel;
  const {
    allFileChangesSelected,
    fileChangeReviewEntries,
    fileChangeStatusCounts,
    selectableFileChangeKeys,
    selectedFileChangeCount,
    selectedFileChangeEntries,
    selectedFileChangeSet,
    setFileChangeDecisions,
    setSelectedFileChangeKeys,
  } = fileReviewState;
  const {
    filteredCatalogTools,
    hasToolInventorySection,
    runtimeToolAvailability,
    runtimeToolCapabilityGaps,
    runtimeToolTotal,
    runtimeToolVisibleTotal,
    setToolInventoryFilter,
    toolInventoryCatalogTools,
    toolInventoryExtensionSurfaces,
    toolInventoryExtensionTools,
    toolInventoryFilter,
    toolInventoryMcpTools,
    toolInventoryRegistryTools,
    toolInventoryRuntimeTools,
    toolInventorySourceStats,
    toolInventoryWarnings,
  } = toolInventoryModel;
  const {
    evidenceExportError,
    evidenceExporting,
    evidencePack,
    handleExportEvidencePack,
  } = handoffExports;
  const { handleOpenPathValue, openBrowserReplayPreview, openPreview } =
    previewModel;

  return {
    registerSectionRef,
    hasSelectedTeamConfig,
    teamConfigSectionProps: {
      selectedTeamLabel: selectedTeamLabel ?? null,
      selectedTeamSummary: selectedTeamSummary ?? null,
      selectedTeamRoles: selectedTeamRoles ?? null,
      registerSectionRef,
    },
    runtimeTaskSectionProps: runtimeTaskPresentation
      ? {
          runtimeTaskPresentation,
          handleOpenExternalLink,
          registerSectionRef,
        }
      : null,
    handoffSectionProps:
      hasHandoffSection && currentSessionId
        ? {
            evidencePack,
            evidenceExporting,
            evidenceExportError,
            registerSectionRef,
            handleExportEvidencePack,
            handleOpenPathValue,
            openPreview,
            openBrowserReplayPreview,
          }
        : null,
    objectiveSection: diagnosticRuntimeContext?.sessionId
      ? {
          title: String(t("agentChat.managedObjective.sectionTitle" as never)),
          badge: threadRead?.managed_objective
            ? String(
                t(
                  `agentChat.managedObjective.status.${threadRead.managed_objective.status}` as never,
                ),
              )
            : String(t("agentChat.managedObjective.badge.empty" as never)),
          panelProps: {
            sessionId: diagnosticRuntimeContext.sessionId,
            workspaceId: diagnosticRuntimeContext.workspaceId,
            objective: threadRead?.managed_objective ?? null,
            runtimeBusy:
              threadRead?.status === "running" ||
              threadRead?.status === "queued" ||
              canInterrupt,
            onObjectiveChanged,
          },
        }
      : null,
    reliabilitySection: {
      shouldRender: threadReliabilityView.shouldRender,
      statusLabel: threadReliabilityView.statusLabel,
      panelProps: {
        threadRead,
        turns,
        threadItems,
        currentTurnId,
        pendingActions,
        submittedActionsInFlight,
        queuedTurns,
        canInterrupt,
        onInterruptCurrentTurn,
        onResumeThread,
        onReplayPendingRequest,
        onPromoteQueuedTurn,
        onManageProviders,
        onOpenExecutionPolicySettings,
        harnessState,
        messages,
        diagnosticRuntimeContext,
      },
    },
    fileReviewSection:
      fileChangeReviewEntries.length > 0
        ? {
            title: String(t("agentChat.harness.fileReview.title" as never)),
            badge: String(
              t(
                "agentChat.harness.fileReview.badge" as never,
                {
                  pending: fileChangeStatusCounts.pending,
                  total: fileChangeReviewEntries.length,
                } as never,
              ),
            ),
            props: {
              entries: fileChangeReviewEntries,
              statusCounts: fileChangeStatusCounts,
              selectableKeys: selectableFileChangeKeys,
              selectedSet: selectedFileChangeSet,
              selectedEntries: selectedFileChangeEntries,
              selectedCount: selectedFileChangeCount,
              allSelected: allFileChangesSelected,
              setSelectedKeys: setSelectedFileChangeKeys,
              setDecisions: setFileChangeDecisions,
              onOpenFileCheckpoints,
              onOpenPreview: openPreview,
              onOpenPath: handleOpenPathValue,
              onOpenUrl: handleOpenExternalLink,
              onRejectedWithoutCheckpoint: () =>
                toast.info(
                  translateAgent(
                    "agentChat.harness.fileReview.toast.rejectedNoCheckpoint",
                  ),
                ),
              onAppliedSelection: (count) =>
                toast.success(
                  translateAgent("agentChat.harness.fileReview.toast.applied", {
                    count,
                  }),
                ),
              translate: translateAgent,
            },
          }
        : null,
    agentUiProjectionSectionProps: hasAgentUiProjectionSection
      ? {
          agentUiProjectionSummary,
          translateProjection,
          registerSectionRef,
        }
      : null,
    runtimeFactsSectionProps: runtimeFactSummary
      ? {
          runtimeFactSummary,
          registerSectionRef,
        }
      : null,
    activeWritesSection:
      harnessState.activeFileWrites.length > 0
        ? {
            count: harnessState.activeFileWrites.length,
            props: {
              writes: harnessState.activeFileWrites,
              onOpenPreview: openPreview,
              onOpenPath: handleOpenPathValue,
              onOpenUrl: handleOpenExternalLink,
            },
          }
        : null,
    outputSignalsSection:
      harnessState.outputSignals.length > 0
        ? {
            totalCount: harnessState.outputSignals.length,
            filteredCount: filteredOutputSignals.length,
            props: {
              signals: harnessState.outputSignals,
              filteredSignals: filteredOutputSignals,
              groupedEntries: groupedOutputEntries,
              filter: outputFilter,
              filterOptions: outputFilterOptions,
              setFilter: setOutputFilter,
              onOpenPreview: openPreview,
              onOpenPath: handleOpenPathValue,
              onOpenUrl: handleOpenExternalLink,
              translate: translateAgent,
            },
          }
        : null,
    toolInventorySectionProps: {
      hasToolInventorySection,
      toolInventory,
      toolInventoryLoading,
      toolInventoryError,
      runtimeToolVisibleTotal,
      runtimeToolTotal,
      registerSectionRef,
      onRefreshToolInventory,
      toolInventorySourceStats,
      toolInventoryWarnings,
      runtimeToolAvailability,
      runtimeToolCapabilityGaps,
      toolInventoryRuntimeTools,
      toolInventoryCatalogTools,
      filteredCatalogTools,
      toolInventoryFilter,
      setToolInventoryFilter,
      toolInventoryRegistryTools,
      toolInventoryExtensionSurfaces,
      toolInventoryExtensionTools,
      toolInventoryMcpTools,
    },
    activitySectionsProps: {
      harnessState,
      registerSectionRef,
      t,
      handleOpenExternalLink,
      handleOpenPathValue,
      handleApprovalResponse,
      submittedActionIds,
      canRespondToActions: Boolean(onRespondToAction),
      fileFilterOptions,
      fileFilter,
      setFileFilter,
      fileDisplayMode,
      setFileDisplayMode,
      filteredFileEvents,
      groupedFileEvents,
      openPreview,
      realTeamSummary,
      childSubagentSessions,
      onOpenSubagentSession,
      environment,
    },
  };
}
