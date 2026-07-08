import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import {
  EMPTY_AGENT_UI_PROJECTION_SUMMARY,
  summarizeAgentUiProjectionEvents,
  type AgentUiProjectionTranslation,
} from "../projection/agentUiProjectionSummary";
import type { AgentUiProjectionScopeFilter } from "../projection/conversationProjectionStore";
import { useAgentUiProjectionEvents } from "../projection/useConversationProjectionStore";
import type { ActionRequired } from "../types";
import {
  buildThreadReliabilitySummary,
  buildThreadReliabilityView,
} from "../utils/threadReliabilityView";
import { HarnessPreviewDialog } from "./HarnessPreviewDialog";
import { HarnessStatusPanelSections } from "./HarnessStatusPanelSections";
import { HarnessStatusPanelShell } from "./HarnessStatusPanelShell";
import type { HarnessStatusPanelProps } from "./HarnessStatusPanelTypes";
import { type AgentTranslation } from "./HarnessStatusPanelPrimitives";
import type { HarnessSectionKey } from "./HarnessStatusSectionFrame";
import { useHarnessPreviewDialog } from "./useHarnessPreviewDialog";
import { useHarnessEvidencePackExport } from "./useHarnessEvidencePackExport";
import {
  buildRuntimeFactSummary,
  buildRuntimeTaskPresentation,
  summarizeChildSubagentSessions,
} from "./harnessStatusPanelViewModel";
import {
  buildHarnessPanelSectionNavItems,
  buildHarnessSummaryCards,
} from "./harnessStatusPanelSummary";
import { buildHarnessStatusPanelSectionModels } from "./harnessStatusPanelSectionModels";
import { useHarnessFileReviewState } from "./useHarnessFileReviewState";
import { useHarnessActivityModel } from "./useHarnessActivityModel";
import { useHarnessToolInventoryModel } from "./useHarnessToolInventoryModel";

export type { HarnessFilePreviewResult } from "./useHarnessPreviewDialog";
export type { HarnessFileChangeReviewSummary } from "./useHarnessFileReviewState";

async function openExternalUrl(url: string): Promise<void> {
  await openExternalUrlWithSystemBrowser(url);
}

export function HarnessStatusPanel({
  harnessState,
  environment,
  layout = "default",
  onLoadFilePreview,
  onOpenFile,
  onRevealPath,
  onOpenPath,
  onOpenFileCheckpoints,
  childSubagentSessions = [],
  onOpenSubagentSession,
  toolInventory,
  toolInventoryLoading = false,
  toolInventoryError = null,
  onRefreshToolInventory,
  mcpPrepareCandidateCount = 0,
  mcpPrepareLoading = false,
  mcpPrepareError = null,
  onPrepareMcpTargets,
  title = "处理工作台",
  description = "集中查看最新进展、文件变更、处理结果和待确认事项。",
  toggleLabel = "详情",
  leadContent,
  selectedTeamLabel = null,
  selectedTeamSummary = null,
  selectedTeamRoles = [],
  threadRead = null,
  turns = [],
  threadItems = [],
  currentTurnId = null,
  pendingActions = [],
  submittedActionsInFlight = [],
  onRespondToAction,
  queuedTurns = [],
  canInterrupt = false,
  onInterruptCurrentTurn,
  onResumeThread,
  onReplayPendingRequest,
  onPromoteQueuedTurn,
  onObjectiveChanged,
  onManageProviders,
  onOpenExecutionPolicySettings,
  messages = [],
  diagnosticRuntimeContext = null,
}: HarnessStatusPanelProps) {
  const { t, i18n } = useTranslation("agent");
  const translateAgent = useCallback<AgentTranslation>(
    (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const translateProjection = useCallback<AgentUiProjectionTranslation>(
    (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const locale = i18n.resolvedLanguage || i18n.language;
  const isDialogLayout = layout === "dialog";
  const [expanded, setExpanded] = useState(isDialogLayout);
  const isDetailsExpanded = isDialogLayout ? true : expanded;
  const activityModel = useHarnessActivityModel(
    harnessState,
    isDetailsExpanded,
  );
  const toolInventoryModel = useHarnessToolInventoryModel({
    toolInventory,
    toolInventoryError,
    toolInventoryLoading,
  });
  const fileReviewState = useHarnessFileReviewState(
    harnessState,
    isDetailsExpanded,
  );
  const { hasToolInventorySection, runtimeToolTotal, runtimeToolVisibleTotal } =
    toolInventoryModel;
  const {
    fileChangeReviewEntries,
    fileChangeReviewSummary,
    fileChangeStatusCounts,
  } = fileReviewState;
  const sectionRefs = useRef<
    Partial<Record<HarnessSectionKey, HTMLElement | null>>
  >({});
  const currentSessionId = diagnosticRuntimeContext?.sessionId?.trim() || null;
  const previewModel = useHarnessPreviewDialog({
    onLoadFilePreview,
    onOpenFile,
    onOpenPath,
    onRevealPath,
  });
  const {
    previewDialog,
    handlePreviewOpenChange,
    handleOpenFile,
    handleCopyPath,
    handleCopyContent,
    handleOpenPathValue,
    handleRevealPath,
    handleOpenPath,
  } = previewModel;
  const evidencePackExport = useHarnessEvidencePackExport(currentSessionId);
  const { evidencePack } = evidencePackExport;
  const agentUiProjectionFilter = useMemo<AgentUiProjectionScopeFilter | null>(
    () => (currentSessionId ? { sessionId: currentSessionId } : null),
    [currentSessionId],
  );
  const agentUiProjectionEvents = useAgentUiProjectionEvents(
    agentUiProjectionFilter,
    { enabled: isDetailsExpanded },
  );
  const agentUiProjectionSummary = useMemo(
    () =>
      isDetailsExpanded && currentSessionId
        ? summarizeAgentUiProjectionEvents(agentUiProjectionEvents)
        : EMPTY_AGENT_UI_PROJECTION_SUMMARY,
    [agentUiProjectionEvents, currentSessionId, isDetailsExpanded],
  );
  const hasAgentUiProjectionSection = agentUiProjectionSummary.total > 0;

  const registerSectionRef = useCallback(
    (key: HarnessSectionKey, node: HTMLElement | null) => {
      sectionRefs.current[key] = node;
    },
    [],
  );

  const scrollToSection = useCallback((key: HarnessSectionKey) => {
    const target = sectionRefs.current[key];
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const handleToggleExpanded = useCallback(() => {
    setExpanded((value) => !value);
  }, []);

  const hasHandoffSection = Boolean(currentSessionId);
  const runtimeTaskPresentation = useMemo(
    () => buildRuntimeTaskPresentation(harnessState.runtimeStatus),
    [harnessState.runtimeStatus],
  );
  const realTeamSummary = useMemo(
    () => summarizeChildSubagentSessions(childSubagentSessions),
    [childSubagentSessions],
  );
  const hasSelectedTeamConfig =
    Boolean(selectedTeamLabel?.trim()) ||
    Boolean(selectedTeamSummary?.trim()) ||
    (selectedTeamRoles?.length ?? 0) > 0;
  const threadReliabilitySummary = useMemo(
    () =>
      buildThreadReliabilitySummary({
        threadRead,
        turns,
        currentTurnId,
        pendingActions,
        submittedActionsInFlight,
        queuedTurns,
        t: translateProjection,
        locale,
      }),
    [
      currentTurnId,
      locale,
      pendingActions,
      queuedTurns,
      submittedActionsInFlight,
      threadRead,
      translateProjection,
      turns,
    ],
  );
  const threadReliabilityView = useMemo(
    () =>
      isDetailsExpanded
        ? buildThreadReliabilityView({
            threadRead,
            turns,
            threadItems,
            currentTurnId,
            pendingActions,
            submittedActionsInFlight,
            queuedTurns,
            t: translateProjection,
            locale,
          })
        : null,
    [
      currentTurnId,
      isDetailsExpanded,
      locale,
      pendingActions,
      queuedTurns,
      submittedActionsInFlight,
      threadItems,
      threadRead,
      translateProjection,
      turns,
    ],
  );
  const submittedActionIds = useMemo(
    () => new Set(submittedActionsInFlight.map((item) => item.requestId)),
    [submittedActionsInFlight],
  );
  const handleApprovalResponse = useCallback(
    (item: ActionRequired, confirmed: boolean) => {
      if (!onRespondToAction || item.actionType !== "tool_confirmation") {
        return;
      }

      void onRespondToAction({
        requestId: item.requestId,
        actionType: item.actionType,
        confirmed,
        response: confirmed ? "approved" : "rejected",
      });
    },
    [onRespondToAction],
  );
  const runtimeFactSummary = useMemo(
    () => buildRuntimeFactSummary(threadRead),
    [threadRead],
  );
  const resolvedLeadContent =
    typeof leadContent === "function"
      ? leadContent({ fileChangeReviewSummary })
      : leadContent;

  const fileReviewTitle = String(
    t("agentChat.harness.fileReview.title" as never),
  );
  const fileReviewSummaryValue = String(
    t(
      "agentChat.harness.fileReview.summaryValue" as never,
      {
        pending: fileChangeStatusCounts.pending,
        total: fileChangeReviewEntries.length,
      } as never,
    ),
  );
  const fileReviewEmptyHint = String(
    t("agentChat.harness.fileReview.emptyHint" as never),
  );
  const selectedTeamRolesCount = selectedTeamRoles?.length || 0;

  const availableSections = useMemo(
    () =>
      buildHarnessPanelSectionNavItems({
        environment,
        fileChangeReviewEntriesLength: fileChangeReviewEntries.length,
        hasAgentUiProjectionSection,
        hasHandoffSection,
        hasSelectedTeamConfig,
        hasToolInventorySection,
        harnessState,
        realTeamSummary,
        runtimeTaskPresentation,
        threadReliability: {
          shouldRender: threadReliabilitySummary.shouldRender,
          statusLabel: threadReliabilitySummary.statusLabel,
          summary: threadReliabilitySummary.summary,
        },
        fileReviewTitle,
      }),
    [
      environment,
      fileChangeReviewEntries.length,
      fileReviewTitle,
      hasAgentUiProjectionSection,
      hasHandoffSection,
      hasSelectedTeamConfig,
      hasToolInventorySection,
      harnessState,
      realTeamSummary,
      runtimeTaskPresentation,
      threadReliabilitySummary.shouldRender,
      threadReliabilitySummary.statusLabel,
      threadReliabilitySummary.summary,
    ],
  );

  const summaryCards = useMemo(
    () =>
      buildHarnessSummaryCards({
        agentUiProjectionSummary,
        environment,
        fileChangeReviewEntries,
        fileReviewCopy: {
          title: fileReviewTitle,
          summaryValue: fileReviewSummaryValue,
          emptyHint: fileReviewEmptyHint,
        },
        evidencePack,
        hasAgentUiProjectionSection,
        hasHandoffSection,
        hasSelectedTeamConfig,
        hasToolInventorySection,
        harnessState,
        realTeamSummary,
        runtimeTaskPresentation,
        runtimeToolTotal,
        runtimeToolVisibleTotal,
        selectedTeamLabel,
        selectedTeamRolesCount,
        selectedTeamSummary,
        threadReliability: {
          shouldRender: threadReliabilitySummary.shouldRender,
          statusLabel: threadReliabilitySummary.statusLabel,
          summary: threadReliabilitySummary.summary,
        },
        toolInventory: toolInventory ?? null,
        toolInventoryError,
        toolInventoryLoading,
        translateProjection,
      }),
    [
      agentUiProjectionSummary,
      environment,
      fileChangeReviewEntries,
      fileReviewEmptyHint,
      fileReviewSummaryValue,
      fileReviewTitle,
      evidencePack,
      hasAgentUiProjectionSection,
      hasHandoffSection,
      hasSelectedTeamConfig,
      hasToolInventorySection,
      harnessState,
      realTeamSummary,
      runtimeTaskPresentation,
      runtimeToolTotal,
      runtimeToolVisibleTotal,
      selectedTeamLabel,
      selectedTeamRolesCount,
      selectedTeamSummary,
      threadReliabilitySummary.shouldRender,
      threadReliabilitySummary.statusLabel,
      threadReliabilitySummary.summary,
      toolInventory,
      toolInventoryError,
      toolInventoryLoading,
      translateProjection,
    ],
  );

  const handleOpenExternalLink = useCallback(async (url: string) => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      toast.error("当前没有可打开的链接");
      return;
    }

    try {
      await openExternalUrl(normalizedUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打开链接失败");
    }
  }, []);
  const sectionModels = useMemo(
    () =>
      isDetailsExpanded
        ? buildHarnessStatusPanelSectionModels({
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
            evidencePackExport,
            hasAgentUiProjectionSection,
            hasHandoffSection,
            hasSelectedTeamConfig,
            harnessState,
            messages,
            onInterruptCurrentTurn,
            onObjectiveChanged,
            onOpenFileCheckpoints,
            onManageProviders,
            onOpenExecutionPolicySettings,
            onOpenSubagentSession,
            onPromoteQueuedTurn,
            onRefreshToolInventory,
            mcpPrepareCandidateCount,
            mcpPrepareLoading,
            mcpPrepareError,
            onPrepareMcpTargets,
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
          })
        : null,
    [
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
      evidencePackExport,
      hasAgentUiProjectionSection,
      hasHandoffSection,
      hasSelectedTeamConfig,
      harnessState,
      isDetailsExpanded,
      messages,
      mcpPrepareCandidateCount,
      mcpPrepareError,
      mcpPrepareLoading,
      onInterruptCurrentTurn,
      onManageProviders,
      onObjectiveChanged,
      onOpenExecutionPolicySettings,
      onOpenFileCheckpoints,
      onOpenSubagentSession,
      onPromoteQueuedTurn,
      onRefreshToolInventory,
      onPrepareMcpTargets,
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
    ],
  );

  return (
    <>
      <HarnessStatusPanelShell
        layout={layout}
        title={title}
        description={description}
        toggleLabel={toggleLabel}
        isDetailsExpanded={isDetailsExpanded}
        realTeamActive={realTeamSummary.active > 0}
        leadContent={resolvedLeadContent}
        summaryCards={summaryCards}
        availableSections={availableSections}
        onToggleExpanded={handleToggleExpanded}
        onScrollToSection={scrollToSection}
      >
        {sectionModels ? (
          <HarnessStatusPanelSections {...sectionModels} />
        ) : null}
      </HarnessStatusPanelShell>

      <HarnessPreviewDialog
        previewDialog={previewDialog}
        canOpenInConversation={Boolean(onOpenFile)}
        onOpenChange={handlePreviewOpenChange}
        onOpenFile={handleOpenFile}
        onCopyPath={handleCopyPath}
        onCopyContent={handleCopyContent}
        onRevealPath={handleRevealPath}
        onOpenPath={handleOpenPath}
        onOpenPathValue={handleOpenPathValue}
        onOpenUrl={handleOpenExternalLink}
      />
    </>
  );
}
