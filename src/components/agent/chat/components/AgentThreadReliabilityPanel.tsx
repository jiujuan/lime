import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Bot,
  Clock3,
  Copy,
  FileText,
  ListTodo,
  Loader2,
  PauseCircle,
  PlayCircle,
  Waves,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { prefetchContextMemoryForTurn } from "@/lib/api/memoryRuntime";
import {
  buildTeamMemoryShadowRequestMetadata,
  type TeamMemorySnapshot,
} from "@/lib/teamMemorySync";
import { recordRuntimeMemoryPrefetchHistory } from "@/lib/runtimeMemoryPrefetchHistory";
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
  resolveMemoryPrefetchComparison,
  truncateDiagnosticText,
  type AgentThreadReliabilityDiagnosticContext,
  type RuntimeMemoryPrefetchComparisonState,
  type RuntimeMemoryPrefetchState,
} from "../utils/threadReliabilityDiagnosticText";
import {
  formatAgentUiProjectionEventDetail,
  formatAgentUiProjectionEventType,
  formatAgentUiProjectionPhase,
  type AgentUiProjectionTranslation,
} from "../projection/agentUiProjectionSummary";
import { useAgentUiProjectionSummary } from "../projection/useConversationProjectionStore";
import { AgentIncidentPanel } from "./AgentIncidentPanel";
import { AgentThreadFileCheckpointDialog } from "./AgentThreadFileCheckpointDialog";
import { AgentThreadMemoryPrefetchBaselineCard } from "./AgentThreadMemoryPrefetchBaselineCard";
import { AgentThreadMemoryPrefetchPreview } from "./AgentThreadMemoryPrefetchPreview";
import { AgentThreadOutcomeSummary } from "./AgentThreadOutcomeSummary";
import { AgentThreadRoutingEvidenceCard } from "./AgentThreadRoutingEvidenceCard";
import { AgentThreadPolicyEvidenceCard } from "./AgentThreadPolicyEvidenceCard";
import {
  resolveLatestTurnPrompt,
  resolveRuntimeDecisionReason,
  resolveRuntimeFallbackChain,
  resolveStatShellClassName,
  resolveTeamMemoryShadowKey,
  resolveToneClassName,
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
  onOpenMemoryWorkbench?: () => void;
  onManageProviders?: (context?: ProviderSettingsFocusContext) => void;
  onOpenExecutionPolicySettings?: (
    context?: ExecutionPolicyFocusContext,
  ) => void;
  className?: string;
  harnessState?: HarnessSessionState | null;
  messages?: Message[];
  teamMemorySnapshot?: TeamMemorySnapshot | null;
  diagnosticRuntimeContext?: AgentThreadReliabilityDiagnosticContext | null;
}

type AgentNamespaceTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => unknown;

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
  onOpenMemoryWorkbench,
  onManageProviders,
  onOpenExecutionPolicySettings,
  className,
  harnessState = null,
  messages = [],
  teamMemorySnapshot = null,
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
  const [memoryPrefetchState, setMemoryPrefetchState] =
    useState<RuntimeMemoryPrefetchState>({
      status: "idle",
      result: null,
      error: null,
    });
  const [memoryPrefetchComparison, setMemoryPrefetchComparison] =
    useState<RuntimeMemoryPrefetchComparisonState>({
      baselineEntry: null,
      diff: null,
      assessment: null,
    });
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
  const latestTurnPrompt = useMemo(
    () => resolveLatestTurnPrompt(turns, currentTurnId),
    [currentTurnId, turns],
  );
  const teamMemoryShadowMetadata = useMemo(
    () => buildTeamMemoryShadowRequestMetadata(teamMemorySnapshot),
    [teamMemorySnapshot],
  );
  const teamMemoryShadowKey = useMemo(
    () => resolveTeamMemoryShadowKey(teamMemoryShadowMetadata),
    [teamMemoryShadowMetadata],
  );
  const diagnosticSessionId = diagnosticRuntimeContext?.sessionId?.trim() || "";
  const diagnosticWorkingDir =
    diagnosticRuntimeContext?.workingDir?.trim() || "";
  const agentUiProjectionSummary = useAgentUiProjectionSummary(
    diagnosticSessionId ? { sessionId: diagnosticSessionId } : null,
    { enabled: Boolean(diagnosticSessionId) },
  );

  useEffect(() => {
    if (!diagnosticSessionId) {
      setMemoryPrefetchState({ status: "idle", result: null, error: null });
      setMemoryPrefetchComparison({
        baselineEntry: null,
        diff: null,
        assessment: null,
      });
      return;
    }
    if (!diagnosticWorkingDir) {
      setMemoryPrefetchState({
        status: "error",
        result: null,
        error: text("memoryPrefetch.noWorkspace"),
      });
      setMemoryPrefetchComparison({
        baselineEntry: null,
        diff: null,
        assessment: null,
      });
      return;
    }

    let cancelled = false;
    setMemoryPrefetchState({
      status: "loading",
      result: null,
      error: null,
    });

    void prefetchContextMemoryForTurn({
      session_id: diagnosticSessionId,
      working_dir: diagnosticWorkingDir,
      user_message: latestTurnPrompt,
      request_metadata: teamMemoryShadowMetadata
        ? {
            team_memory_shadow: teamMemoryShadowMetadata,
          }
        : undefined,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        const historyEntries = recordRuntimeMemoryPrefetchHistory({
          sessionId: diagnosticSessionId,
          workingDir: diagnosticWorkingDir,
          userMessage: latestTurnPrompt || null,
          source: "thread_reliability",
          result,
        });
        setMemoryPrefetchComparison(
          resolveMemoryPrefetchComparison(historyEntries, diagnosticWorkingDir),
        );
        setMemoryPrefetchState({
          status: "ready",
          result,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setMemoryPrefetchState({
          status: "error",
          result: null,
          error:
            error instanceof Error
              ? error.message
              : text("memoryPrefetch.failed"),
        });
        setMemoryPrefetchComparison({
          baselineEntry: null,
          diff: null,
          assessment: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    diagnosticSessionId,
    diagnosticWorkingDir,
    latestTurnPrompt,
    text,
    teamMemoryShadowKey,
    teamMemoryShadowMetadata,
  ]);

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
      await navigator.clipboard.writeText(
        buildReliabilityDiagnosticText({
          threadRead,
          statusLabel,
          summary,
          view,
          threadItems,
          messages,
          harnessState,
          memoryPrefetchState,
          memoryPrefetchComparison,
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
            memoryPrefetchState,
            memoryPrefetchComparison,
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
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium tracking-wide text-muted-foreground">
            {text("title")}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-700"
            >
              {text("badge.quickDiagnostic")}
            </Badge>
            <Badge
              variant="outline"
              className={resolveToneClassName(statusTone)}
            >
              {statusLabel}
            </Badge>
            {view.activeTurnLabel ? (
              <span className="text-sm font-medium text-foreground">
                {view.activeTurnLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {summary}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
          {view.updatedAtLabel ? (
            <span>{text("lastUpdated", { value: view.updatedAtLabel })}</span>
          ) : null}
          {view.interruptStateLabel ? (
            <Badge
              variant="outline"
              className="border-slate-200 bg-slate-50 text-slate-700"
            >
              {view.interruptStateLabel}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleCopyDiagnostic()}
            className="h-8 rounded-full"
            data-testid="agent-thread-reliability-copy"
          >
            <Copy className="mr-2 h-3.5 w-3.5" />
            {text("copyDiagnostic")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleCopyRawJson()}
            className="h-8 rounded-full"
            data-testid="agent-thread-reliability-copy-json"
          >
            <Copy className="mr-2 h-3.5 w-3.5" />
            {text("copyJsonDebug")}
          </Button>
        </div>
      </div>
      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] leading-5 text-amber-900">
        {text("handoffNotice")}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <div
          className={cn(
            "rounded-2xl border px-3 py-3",
            resolveStatShellClassName(
              view.pendingRequestCount > 0 ? "waiting" : "neutral",
            ),
          )}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ListTodo className="h-4 w-4" />
            <span>{text("stats.pendingRequests")}</span>
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {view.pendingRequestCount}
          </div>
        </div>

        <div
          className={cn(
            "rounded-2xl border px-3 py-3",
            resolveStatShellClassName(
              view.activeIncidentCount > 0 ? "failed" : "neutral",
            ),
          )}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            <span>{text("stats.activeIncidents")}</span>
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {view.activeIncidentCount}
          </div>
        </div>

        <div
          className={cn(
            "rounded-2xl border px-3 py-3",
            resolveStatShellClassName(
              view.queuedTurnCount > 0 ? "waiting" : "neutral",
            ),
          )}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Waves className="h-4 w-4" />
            <span>{text("stats.queuedTurns")}</span>
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {view.queuedTurnCount}
          </div>
        </div>
      </div>

      {agentUiProjectionSummary.total > 0 ? (
        <div
          className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3"
          data-testid="agent-thread-reliability-agentui-projection"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-sky-900">
              <Bot className="h-4 w-4" />
              <span>{text("projection.title")}</span>
            </div>
            <Badge
              variant="outline"
              className="border-sky-300 bg-white text-sky-700"
            >
              {text("projection.count", {
                count: agentUiProjectionSummary.total,
              })}
            </Badge>
            <span className="text-xs text-sky-800">
              {text("projection.source")}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-sky-100 bg-white px-3 py-2">
              <div className="text-[11px] text-sky-700">
                {text("projection.metric.action")}
              </div>
              <div className="mt-1 text-lg font-semibold text-sky-950">
                {agentUiProjectionSummary.actionCount}
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-white px-3 py-2">
              <div className="text-[11px] text-sky-700">
                {text("projection.metric.task")}
              </div>
              <div className="mt-1 text-lg font-semibold text-sky-950">
                {agentUiProjectionSummary.taskCount}
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-white px-3 py-2">
              <div className="text-[11px] text-sky-700">
                {text("projection.metric.artifact")}
              </div>
              <div className="mt-1 text-lg font-semibold text-sky-950">
                {agentUiProjectionSummary.artifactCount}
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-white px-3 py-2">
              <div className="text-[11px] text-sky-700">
                {text("projection.metric.evidence")}
              </div>
              <div className="mt-1 text-lg font-semibold text-sky-950">
                {agentUiProjectionSummary.evidenceCount}
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-white px-3 py-2">
              <div className="text-[11px] text-sky-700">
                {text("projection.metric.diagnostics")}
              </div>
              <div className="mt-1 text-lg font-semibold text-sky-950">
                {agentUiProjectionSummary.diagnosticsCount}
              </div>
            </div>
          </div>
          {agentUiProjectionSummary.latestEvent ? (
            <div className="mt-3 text-xs leading-5 text-sky-900">
              {text("projection.latestEventPrefix")}
              {formatAgentUiProjectionEventType(
                agentUiProjectionSummary.latestEvent.type,
                translateProjection,
              )}
              {" · "}
              {formatAgentUiProjectionPhase(
                agentUiProjectionSummary.latestEvent.phase,
                translateProjection,
              )}
              {" · "}
              {formatAgentUiProjectionEventDetail(
                agentUiProjectionSummary.latestEvent,
              )}
            </div>
          ) : null}
        </div>
      ) : null}

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

      {diagnosticSessionId ? (
        <AgentThreadMemoryPrefetchPreview
          status={memoryPrefetchState.status}
          result={memoryPrefetchState.result}
          error={memoryPrefetchState.error}
          actions={
            onOpenMemoryWorkbench ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenMemoryWorkbench}
                className="h-8 rounded-full border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
              >
                {text("memoryPrefetch.openWorkbench")}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {memoryPrefetchState.status === "ready" &&
      memoryPrefetchComparison.baselineEntry &&
      memoryPrefetchComparison.diff ? (
        <AgentThreadMemoryPrefetchBaselineCard
          comparison={memoryPrefetchComparison}
        />
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

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
