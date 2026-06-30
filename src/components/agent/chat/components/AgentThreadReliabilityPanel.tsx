import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Clock3,
  FileText,
  Loader2,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  AgentRuntimeThreadReadModel,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
  Message,
} from "../types";
import type { HarnessSessionState } from "../utils/harnessState";
import { buildThreadReliabilityView } from "../utils/threadReliabilityView";
import { resolveRuntimeRoutingEvidence } from "../utils/runtimeRoutingEvidence";
import {
  buildReliabilityDiagnosticText,
  buildReliabilityRawPayload,
  formatDiagnosticDateTime,
  truncateDiagnosticText,
  type AgentThreadReliabilityDiagnosticContext,
} from "../utils/threadReliabilityDiagnosticText";
import { type AgentUiProjectionTranslation } from "../projection/agentUiProjectionSummary";
import {
  EMPTY_AGENT_UI_PROJECTION_SUMMARY,
  summarizeAgentUiProjectionEvents,
  type AgentUiProjectionSummary,
} from "../projection/agentUiProjectionSummary";
import {
  conversationProjectionStore,
  selectAgentUiProjectionEventsForScope,
} from "../projection/conversationProjectionStore";
import { AgentIncidentPanel } from "./AgentIncidentPanel";
import { AgentThreadFileCheckpointDialog } from "./AgentThreadFileCheckpointDialog";
import { AgentThreadOutcomeSummary } from "./AgentThreadOutcomeSummary";
import { AgentThreadRoutingEvidenceCard } from "./AgentThreadRoutingEvidenceCard";
import { AgentThreadPolicyEvidenceCard } from "./AgentThreadPolicyEvidenceCard";
import { AgentThreadReliabilityPanelHeader } from "./AgentThreadReliabilityPanelHeader";
import { AgentThreadReliabilityStats } from "./AgentThreadReliabilityStats";
import {
  resolveToneClassName,
  resolveRuntimeDecisionReason,
  resolveRuntimeFallbackChain,
  serializeReliabilityClipboardPayload,
} from "./AgentThreadReliabilityPanelViewModel";
import type {
  ExecutionPolicyFocusContext,
  ProviderSettingsFocusContext,
} from "@/types/page";

interface AgentThreadReliabilityPanelProps {
  threadRead?: AgentRuntimeThreadReadModel | null;
  turns?: AgentThreadTurn[];
  threadItems?: AgentThreadItem[];
  currentTurnId?: string | null;
  pendingActions?: ActionRequired[];
  submittedActionsInFlight?: ActionRequired[];
  queuedTurns?: QueuedTurnSnapshot[];
  canInterrupt?: boolean;
  onInterruptCurrentTurn?: () => void | Promise<void>;
  onResumeThread?: () => boolean | Promise<boolean>;
  onReplayPendingRequest?: (requestId: string) => boolean | Promise<boolean>;
  onLocatePendingRequest?: (requestId: string) => void;
  onPromoteQueuedTurn?: (queuedTurnId: string) => boolean | Promise<boolean>;
  onManageProviders?: (context?: ProviderSettingsFocusContext) => void;
  onOpenExecutionPolicySettings?: (
    context?: ExecutionPolicyFocusContext,
  ) => void;
  className?: string;
  harnessState?: HarnessSessionState | null;
  messages?: Message[];
  diagnosticRuntimeContext?: AgentThreadReliabilityDiagnosticContext | null;
}

type AgentNamespaceTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => unknown;

function readAgentUiProjectionSummarySnapshot(
  sessionId: string,
): AgentUiProjectionSummary {
  if (!sessionId) {
    return EMPTY_AGENT_UI_PROJECTION_SUMMARY;
  }
  return summarizeAgentUiProjectionEvents(
    selectAgentUiProjectionEventsForScope(
      conversationProjectionStore.getSnapshot(),
      { sessionId },
    ),
  );
}

export const AgentThreadReliabilityPanel: React.FC<
  AgentThreadReliabilityPanelProps
> = ({
  threadRead,
  turns = [],
  threadItems = [],
  currentTurnId = null,
  pendingActions = [],
  submittedActionsInFlight = [],
  queuedTurns = [],
  canInterrupt = false,
  onInterruptCurrentTurn,
  onResumeThread,
  onReplayPendingRequest,
  onLocatePendingRequest,
  onPromoteQueuedTurn,
  onManageProviders,
  onOpenExecutionPolicySettings,
  className,
  harnessState = null,
  messages = [],
  diagnosticRuntimeContext = null,
}) => {
  const { t, i18n } = useTranslation("agent");
  const agentT = useMemo(() => t as unknown as AgentNamespaceTranslation, [t]);
  const translateProjection = useCallback<AgentUiProjectionTranslation>(
    (key, options) => String(agentT(key, options)),
    [agentT],
  );
  const text = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      String(agentT(`agentChat.threadReliability.panel.${key}`, options)),
    [agentT],
  );
  const locale = i18n.resolvedLanguage || i18n.language;
  const routingEvidenceText = useMemo(
    () => ({
      appliedFallback: String(
        agentT("agentChat.threadReliability.routingEvidence.appliedFallback"),
      ),
      decisionReason: String(
        agentT("agentChat.threadReliability.routingEvidence.decisionReason"),
      ),
      decisionSource: String(
        agentT("agentChat.threadReliability.routingEvidence.decisionSource"),
      ),
      durationUnknown: String(
        agentT("agentChat.threadReliability.routingEvidence.durationUnknown"),
      ),
      evidence: String(
        agentT("agentChat.threadReliability.routingEvidence.evidence"),
      ),
      evidenceSource: String(
        agentT("agentChat.threadReliability.routingEvidence.evidenceSource"),
      ),
      fallbackSlot: String(
        agentT("agentChat.threadReliability.routingEvidence.fallbackSlot"),
      ),
      fallbackChain: String(
        agentT("agentChat.threadReliability.routingEvidence.fallbackChain"),
      ),
      firstText: String(
        agentT("agentChat.threadReliability.routingEvidence.firstText"),
      ),
      firstThinking: String(
        agentT("agentChat.threadReliability.routingEvidence.firstThinking"),
      ),
      firstVisible: String(
        agentT("agentChat.threadReliability.routingEvidence.firstVisible"),
      ),
      firstTokenMetrics: String(
        agentT("agentChat.threadReliability.routingEvidence.firstTokenMetrics"),
      ),
      none: String(agentT("agentChat.threadReliability.routingEvidence.none")),
      oemLocked: String(
        agentT("agentChat.threadReliability.routingEvidence.oemLocked"),
      ),
      oemModelPrefix: String(
        agentT("agentChat.threadReliability.routingEvidence.oemModelPrefix"),
      ),
      oemQuotaLow: String(
        agentT("agentChat.threadReliability.routingEvidence.oemQuotaLow"),
      ),
      policy: String(
        agentT("agentChat.threadReliability.routingEvidence.policy"),
      ),
      policyFailure: String(
        agentT("agentChat.threadReliability.routingEvidence.policyFailure"),
      ),
      policyProfile: String(
        agentT("agentChat.threadReliability.routingEvidence.policyProfile"),
      ),
      policySources: String(
        agentT("agentChat.threadReliability.routingEvidence.policySources"),
      ),
      policyOpenSettings: String(
        agentT(
          "agentChat.threadReliability.routingEvidence.policyOpenSettings",
        ),
      ),
      policySummary: String(
        agentT("agentChat.threadReliability.routingEvidence.policySummary"),
      ),
      policyTitle: String(
        agentT("agentChat.threadReliability.routingEvidence.policyTitle"),
      ),
      sandbox: String(
        agentT("agentChat.threadReliability.routingEvidence.sandbox"),
      ),
      sandboxBackend: String(
        agentT("agentChat.threadReliability.routingEvidence.sandboxBackend"),
      ),
      network: String(
        agentT("agentChat.threadReliability.routingEvidence.network"),
      ),
      networkDecision: String(
        agentT("agentChat.threadReliability.routingEvidence.networkDecision"),
      ),
      selectedModel: String(
        agentT("agentChat.threadReliability.routingEvidence.selectedModel"),
      ),
      providerReadiness: String(
        agentT("agentChat.threadReliability.routingEvidence.providerReadiness"),
      ),
      providerReadinessKeys: String(
        agentT(
          "agentChat.threadReliability.routingEvidence.providerReadinessKeys",
        ),
      ),
      providerReadinessOpenSettings: String(
        agentT(
          "agentChat.threadReliability.routingEvidence.providerReadinessOpenSettings",
        ),
      ),
      providerReadinessProviderType: String(
        agentT(
          "agentChat.threadReliability.routingEvidence.providerReadinessProviderType",
        ),
      ),
      providerReadinessRecovery: String(
        agentT(
          "agentChat.threadReliability.routingEvidence.providerReadinessRecovery",
        ),
      ),
      routingAttempts: String(
        agentT("agentChat.threadReliability.routingEvidence.routingAttempts"),
      ),
      modelRegistry: String(
        agentT("agentChat.threadReliability.routingEvidence.modelRegistry"),
      ),
      modelRegistryAlias: String(
        agentT(
          "agentChat.threadReliability.routingEvidence.modelRegistryAlias",
        ),
      ),
      modelRegistryCapabilities: String(
        agentT(
          "agentChat.threadReliability.routingEvidence.modelRegistryCapabilities",
        ),
      ),
      modelRegistryReasoning: String(
        agentT(
          "agentChat.threadReliability.routingEvidence.modelRegistryReasoning",
        ),
      ),
      requestedModel: String(
        agentT("agentChat.threadReliability.routingEvidence.requestedModel"),
      ),
      run: String(agentT("agentChat.threadReliability.routingEvidence.run")),
      runUnknown: String(
        agentT("agentChat.threadReliability.routingEvidence.runUnknown"),
      ),
      serviceModelSlot: String(
        agentT("agentChat.threadReliability.routingEvidence.serviceModelSlot"),
      ),
      settingsSource: String(
        agentT("agentChat.threadReliability.routingEvidence.settingsSource"),
      ),
      title: String(
        agentT("agentChat.threadReliability.routingEvidence.title"),
      ),
      unknown: String(
        agentT("agentChat.threadReliability.routingEvidence.unknown"),
      ),
      unset: String(
        agentT("agentChat.threadReliability.routingEvidence.unset"),
      ),
    }),
    [agentT],
  );
  const [isInterrupting, setIsInterrupting] = useState(false);
  const [isResumingThread, setIsResumingThread] = useState(false);
  const [isReplayingRequest, setIsReplayingRequest] = useState(false);
  const [isPromotingQueuedTurn, setIsPromotingQueuedTurn] = useState(false);
  const [fileCheckpointDialogOpen, setFileCheckpointDialogOpen] =
    useState(false);
  const view = useMemo(
    () =>
      buildThreadReliabilityView({
        threadRead,
        turns,
        threadItems,
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
      threadItems,
      threadRead,
      translateProjection,
      turns,
    ],
  );
  const statusLabel = isInterrupting
    ? text("status.interrupting")
    : view.statusLabel;
  const statusTone = isInterrupting ? "paused" : view.statusTone;
  const summary = isInterrupting ? text("summary.interrupting") : view.summary;
  const latestCompactionBoundary =
    threadRead?.latest_compaction_boundary || null;
  const oemPolicy = threadRead?.oem_policy || null;
  const runtimeRoutingEvidence = useMemo(
    () => resolveRuntimeRoutingEvidence(threadRead),
    [threadRead],
  );
  const fallbackChain = resolveRuntimeFallbackChain(
    threadRead,
    runtimeRoutingEvidence,
  );
  const runtimeDecisionReason = resolveRuntimeDecisionReason(
    threadRead,
    runtimeRoutingEvidence,
  );
  const latestCompactionCreatedLabel = formatDiagnosticDateTime(
    latestCompactionBoundary?.created_at,
    locale,
  );
  const latestCompactionDetail = truncateDiagnosticText(
    latestCompactionBoundary?.detail,
    160,
  );
  const latestCompactionSummary =
    latestCompactionBoundary?.summary_preview ||
    text("compaction.summaryFallback");
  const fileCheckpointSummary = threadRead?.file_checkpoint_summary || null;
  const latestFileCheckpoint = fileCheckpointSummary?.latest_checkpoint || null;
  const latestFileCheckpointUpdatedLabel = formatDiagnosticDateTime(
    latestFileCheckpoint?.updated_at,
    locale,
  );
  const latestFileCheckpointPreview = truncateDiagnosticText(
    latestFileCheckpoint?.preview_text,
    180,
  );
  const diagnosticSessionId = diagnosticRuntimeContext?.sessionId?.trim() || "";
  const diagnosticWorkingDir =
    diagnosticRuntimeContext?.workingDir?.trim() || "";

  if (!view.shouldRender) {
    return null;
  }

  const handleInterrupt = async () => {
    if (!onInterruptCurrentTurn || isInterrupting) {
      return;
    }

    setIsInterrupting(true);
    try {
      await onInterruptCurrentTurn();
    } finally {
      setIsInterrupting(false);
    }
  };

  const handleLocatePendingRequest = () => {
    const requestId = view.pendingRequests[0]?.id;
    if (!requestId || !onLocatePendingRequest) {
      return;
    }
    onLocatePendingRequest(requestId);
  };

  const handlePromoteQueuedTurn = async () => {
    const queuedTurnId = view.nextQueuedTurn?.id;
    if (!queuedTurnId || !onPromoteQueuedTurn || isPromotingQueuedTurn) {
      return;
    }

    setIsPromotingQueuedTurn(true);
    try {
      await onPromoteQueuedTurn(queuedTurnId);
    } finally {
      setIsPromotingQueuedTurn(false);
    }
  };

  const handleReplayPendingRequest = async () => {
    const requestId = view.pendingRequests[0]?.id;
    if (!requestId || !onReplayPendingRequest || isReplayingRequest) {
      return;
    }

    setIsReplayingRequest(true);
    try {
      await onReplayPendingRequest(requestId);
    } finally {
      setIsReplayingRequest(false);
    }
  };

  const handleResumeThread = async () => {
    if (!onResumeThread || isResumingThread) {
      return;
    }

    setIsResumingThread(true);
    try {
      await onResumeThread();
    } finally {
      setIsResumingThread(false);
    }
  };

  const handleCopyDiagnostic = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error(text("toast.clipboardUnsupported"));
      return;
    }

    try {
      const agentUiProjectionSummary =
        readAgentUiProjectionSummarySnapshot(diagnosticSessionId);
      await navigator.clipboard.writeText(
        buildReliabilityDiagnosticText({
          threadRead,
          statusLabel,
          summary,
          view,
          threadItems,
          messages,
          harnessState,
          diagnosticRuntimeContext,
          agentUiProjectionSummary,
          routingEvidenceLineText: routingEvidenceText,
          t: translateProjection,
        }),
      );
      toast.success(text("toast.diagnosticCopied"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : text("toast.diagnosticFailed"),
      );
    }
  };

  const handleCopyRawJson = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error(text("toast.clipboardUnsupported"));
      return;
    }

    try {
      const agentUiProjectionSummary =
        readAgentUiProjectionSummarySnapshot(diagnosticSessionId);
      await navigator.clipboard.writeText(
        serializeReliabilityClipboardPayload(
          buildReliabilityRawPayload({
            threadRead,
            turns,
            threadItems,
            currentTurnId,
            pendingActions,
            submittedActionsInFlight,
            queuedTurns,
            view,
            harnessState,
            messages,
            diagnosticRuntimeContext,
            agentUiProjectionSummary,
          }),
        ),
      );
      toast.success(text("toast.rawJsonCopied"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : text("toast.rawJsonFailed"),
      );
    }
  };

  return (
    <section
      className={cn(
        "mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-950/5",
        className,
      )}
      data-testid="agent-thread-reliability-panel"
    >
      <AgentThreadReliabilityPanelHeader
        activeTurnLabel={view.activeTurnLabel}
        copyDiagnosticLabel={text("copyDiagnostic")}
        copyJsonDebugLabel={text("copyJsonDebug")}
        interruptStateLabel={view.interruptStateLabel}
        lastUpdatedLabel={
          view.updatedAtLabel
            ? text("lastUpdated", { value: view.updatedAtLabel })
            : null
        }
        quickDiagnosticLabel={text("badge.quickDiagnostic")}
        statusLabel={statusLabel}
        statusTone={statusTone}
        summary={summary}
        title={text("title")}
        onCopyDiagnostic={() => void handleCopyDiagnostic()}
        onCopyRawJson={() => void handleCopyRawJson()}
      />
      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] leading-5 text-amber-900">
        {text("handoffNotice")}
      </div>

      <AgentThreadReliabilityStats
        activeIncidentCount={view.activeIncidentCount}
        activeIncidentsLabel={text("stats.activeIncidents")}
        pendingRequestCount={view.pendingRequestCount}
        pendingRequestsLabel={text("stats.pendingRequests")}
        queuedTurnCount={view.queuedTurnCount}
        queuedTurnsLabel={text("stats.queuedTurns")}
      />

      <AgentThreadRoutingEvidenceCard
        evidence={runtimeRoutingEvidence}
        decisionReason={runtimeDecisionReason}
        fallbackChain={fallbackChain}
        oemPolicy={oemPolicy}
        labels={routingEvidenceText}
        onOpenProviderSettings={onManageProviders}
      />

      <AgentThreadPolicyEvidenceCard
        threadRead={threadRead}
        decisionReason={runtimeDecisionReason}
        fallbackChain={fallbackChain}
        labels={{
          title: routingEvidenceText.policyTitle,
          policy: routingEvidenceText.policy,
          policyProfile: routingEvidenceText.policyProfile,
          policySources: routingEvidenceText.policySources,
          sandbox: routingEvidenceText.sandbox,
          sandboxBackend: routingEvidenceText.sandboxBackend,
          network: routingEvidenceText.network,
          networkDecision: routingEvidenceText.networkDecision,
          failure: routingEvidenceText.policyFailure,
          openSettings: routingEvidenceText.policyOpenSettings,
          summary: routingEvidenceText.policySummary,
          none: routingEvidenceText.none,
          unknown: routingEvidenceText.unknown,
        }}
        onOpenExecutionPolicySettings={onOpenExecutionPolicySettings}
      />

      {(canInterrupt && onInterruptCurrentTurn) ||
      (view.pendingRequests.length > 0 && onReplayPendingRequest) ||
      (view.nextQueuedTurn && onResumeThread) ||
      (view.pendingRequests.length > 0 && onLocatePendingRequest) ||
      (view.nextQueuedTurn && onPromoteQueuedTurn) ||
      view.recommendations.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-sm font-medium text-foreground">
            {text("actions.title")}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {canInterrupt && onInterruptCurrentTurn ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleInterrupt()}
                disabled={
                  isInterrupting ||
                  isResumingThread ||
                  isReplayingRequest ||
                  isPromotingQueuedTurn
                }
                className="border-slate-300 bg-white"
              >
                {isInterrupting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PauseCircle className="mr-2 h-4 w-4" />
                )}
                {isInterrupting
                  ? text("actions.stopping")
                  : text("actions.stopCurrent")}
              </Button>
            ) : null}

            {view.pendingRequests.length > 0 && onReplayPendingRequest ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleReplayPendingRequest()}
                disabled={
                  isInterrupting ||
                  isResumingThread ||
                  isReplayingRequest ||
                  isPromotingQueuedTurn
                }
                className="border-sky-300 bg-white text-sky-700 hover:bg-sky-50"
              >
                {isReplayingRequest ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 h-4 w-4" />
                )}
                {isReplayingRequest
                  ? text("actions.replaying")
                  : text("actions.replayRequest")}
              </Button>
            ) : null}

            {view.pendingRequests.length > 0 && onLocatePendingRequest ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLocatePendingRequest}
                disabled={
                  isInterrupting ||
                  isResumingThread ||
                  isReplayingRequest ||
                  isPromotingQueuedTurn
                }
                className="border-amber-300 bg-white text-amber-700 hover:bg-amber-50"
              >
                <Clock3 className="mr-2 h-4 w-4" />
                {text("actions.locatePendingRequest")}
              </Button>
            ) : null}

            {view.nextQueuedTurn && onResumeThread ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleResumeThread()}
                disabled={
                  isInterrupting ||
                  isResumingThread ||
                  isReplayingRequest ||
                  isPromotingQueuedTurn
                }
                className="border-sky-300 bg-white text-sky-700 hover:bg-sky-50"
              >
                {isResumingThread ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 h-4 w-4" />
                )}
                {isResumingThread
                  ? text("actions.resuming")
                  : text("actions.resumeThread")}
              </Button>
            ) : null}

            {view.nextQueuedTurn && onPromoteQueuedTurn ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handlePromoteQueuedTurn()}
                disabled={
                  isInterrupting ||
                  isResumingThread ||
                  isReplayingRequest ||
                  isPromotingQueuedTurn
                }
                className="border-sky-300 bg-white text-sky-700 hover:bg-sky-50"
              >
                {isPromotingQueuedTurn ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 h-4 w-4" />
                )}
                {isPromotingQueuedTurn
                  ? text("actions.resuming")
                  : view.nextQueuedTurn.positionLabel
                    ? text("actions.promoteQueuedWithPosition", {
                        position: view.nextQueuedTurn.positionLabel,
                      })
                    : text("actions.promoteQueued")}
              </Button>
            ) : null}
          </div>

          {view.recommendations.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {view.recommendations.map((recommendation) => (
                <Badge
                  key={recommendation}
                  variant="outline"
                  className="border-slate-200 bg-white text-slate-700"
                >
                  {recommendation}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {view.pendingRequests.length > 0 ? (
        <div
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
          data-testid="agent-thread-reliability-requests"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <Clock3 className="h-4 w-4" />
            <span>{text("requests.title")}</span>
          </div>
          <div className="mt-3 space-y-2">
            {view.pendingRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-xl border border-amber-200/80 bg-white px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-foreground">
                    {request.title}
                  </div>
                  <Badge
                    variant="outline"
                    className={resolveToneClassName(request.statusTone)}
                  >
                    {request.typeLabel}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {request.statusLabel}
                  </span>
                </div>
                {request.waitingLabel || request.createdAtLabel ? (
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    {[request.waitingLabel, request.createdAtLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {view.submittedRequests.length > 0 ? (
        <div
          className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3"
          data-testid="agent-thread-reliability-submitted"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-sky-800">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{text("submitted.title")}</span>
          </div>
          <div className="mt-3 space-y-2">
            {view.submittedRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-xl border border-sky-200/80 bg-white px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-foreground">
                    {request.title}
                  </div>
                  <Badge
                    variant="outline"
                    className={resolveToneClassName(request.statusTone)}
                  >
                    {request.typeLabel}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {request.statusLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {latestCompactionBoundary ? (
        <div
          className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
          data-testid="agent-thread-reliability-compaction-boundary"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-emerald-900">
              {text("compaction.title")}
            </div>
            {latestCompactionBoundary.trigger ? (
              <Badge
                variant="outline"
                className="border-emerald-300 bg-white text-emerald-700"
              >
                {latestCompactionBoundary.trigger}
              </Badge>
            ) : null}
            {typeof latestCompactionBoundary.turn_count === "number" ? (
              <Badge
                variant="outline"
                className="border-emerald-300 bg-white text-emerald-700"
              >
                {text("compaction.turnCount", {
                  count: latestCompactionBoundary.turn_count,
                })}
              </Badge>
            ) : null}
          </div>
          <div className="mt-2 text-sm leading-6 text-emerald-950">
            {latestCompactionSummary}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-emerald-800">
            <span title={String(latestCompactionBoundary.created_at)}>
              {text("compaction.createdAt", {
                value: latestCompactionCreatedLabel || text("unknown"),
              })}
            </span>
            {latestCompactionDetail ? (
              <span>
                {text("compaction.note", { value: latestCompactionDetail })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {fileCheckpointSummary?.count ? (
        <div
          className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3"
          data-testid="agent-thread-reliability-file-checkpoints"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-sky-900">
                <FileText className="h-4 w-4" />
                <span>{text("fileCheckpoints.title")}</span>
              </div>
              <Badge
                variant="outline"
                className="border-sky-300 bg-white text-sky-700"
              >
                {text("fileCheckpoints.count", {
                  count: fileCheckpointSummary.count,
                })}
              </Badge>
              {typeof latestFileCheckpoint?.version_no === "number" ? (
                <Badge
                  variant="outline"
                  className="border-slate-200 bg-white text-slate-700"
                >
                  {text("fileCheckpoints.version", {
                    version: latestFileCheckpoint.version_no,
                  })}
                </Badge>
              ) : null}
            </div>
            {diagnosticSessionId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFileCheckpointDialogOpen(true)}
                className="h-8 border-sky-300 bg-white text-sky-700 hover:bg-sky-100"
                data-testid="agent-thread-file-checkpoint-open"
              >
                {text("fileCheckpoints.openDetail")}
              </Button>
            ) : null}
          </div>
          {latestFileCheckpoint ? (
            <>
              <div className="mt-2 text-sm font-medium leading-6 text-sky-950">
                {latestFileCheckpoint.path}
              </div>
              {latestFileCheckpointPreview ? (
                <div className="mt-1 text-sm leading-6 text-sky-900">
                  {latestFileCheckpointPreview}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-sky-800">
                <span title={String(latestFileCheckpoint.updated_at)}>
                  {text("fileCheckpoints.updatedAt", {
                    value: latestFileCheckpointUpdatedLabel || text("unknown"),
                  })}
                </span>
                {latestFileCheckpoint.title ? (
                  <span>
                    {text("fileCheckpoints.itemTitle", {
                      value: latestFileCheckpoint.title,
                    })}
                  </span>
                ) : null}
                {latestFileCheckpoint.status ? (
                  <span>
                    {text("fileCheckpoints.status", {
                      value: latestFileCheckpoint.status,
                    })}
                  </span>
                ) : null}
                {latestFileCheckpoint.validation_issue_count > 0 ? (
                  <span>
                    {text("fileCheckpoints.validationIssues", {
                      count: latestFileCheckpoint.validation_issue_count,
                    })}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm leading-6 text-sky-900">
              {text("fileCheckpoints.emptyLatest")}
            </div>
          )}
        </div>
      ) : null}

      {diagnosticSessionId ? (
        <AgentThreadFileCheckpointDialog
          open={fileCheckpointDialogOpen}
          onOpenChange={setFileCheckpointDialogOpen}
          sessionId={diagnosticSessionId}
          workingDir={diagnosticWorkingDir || null}
          defaultCheckpointId={latestFileCheckpoint?.checkpoint_id || null}
        />
      ) : null}

      <div className="mt-4 grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
        {view.outcome ? (
          <AgentThreadOutcomeSummary outcome={view.outcome} />
        ) : (
          <div
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            data-testid="agent-thread-outcome-empty"
          >
            <div className="text-sm font-medium text-slate-700">
              {text("outcome.emptyTitle")}
            </div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              {text("outcome.emptyDescription")}
            </div>
          </div>
        )}

        <AgentIncidentPanel incidents={view.incidents} />
      </div>
    </section>
  );
};
