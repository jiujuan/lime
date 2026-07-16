import type { QueuedTurnSnapshot } from "@/lib/api/queuedTurn";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime/sessionTypes";
import {
  formatAgentUiProjectionEventDetail,
  formatAgentUiProjectionEventType,
  formatAgentUiProjectionPhase,
  type AgentUiProjectionSummary,
  type AgentUiProjectionTranslation,
} from "../projection/agentUiProjectionSummary";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
  Message,
} from "../types";
import type { HarnessSessionState } from "./harnessState";
import { isRuntimePermissionConfirmationWaitMessage } from "./runtimeActionConfirmation";
import { buildThreadReliabilityView } from "./threadReliabilityView";
import {
  buildRuntimeRoutingEvidenceLines,
  resolveRuntimeRoutingEvidence,
  type RuntimeRoutingEvidenceLineText,
} from "./runtimeRoutingEvidence";
import {
  buildRuntimePolicyEvidenceLines,
  resolveRuntimePolicyEvidence,
} from "./runtimePolicyEvidence";
import { formatProviderSafetyBufferingDiagnostic } from "./providerSafetyBufferingDiagnostic";

export interface AgentThreadReliabilityDiagnosticContext {
  sessionId?: string | null;
  workspaceId?: string | null;
  workingDir?: string | null;
  providerType?: string | null;
  model?: string | null;
  executionStrategy?: string | null;
  activeTheme?: string | null;
}

const DIAGNOSTIC_I18N_PREFIX = "agentChat.threadReliability.diagnostic.";

function tr(
  t: AgentUiProjectionTranslation,
  key: string,
  options?: Record<string, unknown>,
): string {
  return t(`${DIAGNOSTIC_I18N_PREFIX}${key}`, options);
}

function bullet(
  t: AgentUiProjectionTranslation,
  key: string,
  options?: Record<string, unknown>,
): string {
  return `- ${tr(t, key, options)}`;
}

function normalizeDiagnosticText(value?: string | null): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function sanitizeReliabilityDiagnosticText(
  value: string | null | undefined,
  t: AgentUiProjectionTranslation,
): string | null {
  const normalized = normalizeDiagnosticText(value);
  if (!normalized) {
    return null;
  }
  if (isRuntimePermissionConfirmationWaitMessage(normalized)) {
    return tr(t, "value.waitingPermission");
  }
  return normalized;
}

export function truncateDiagnosticText(
  value?: string | null,
  maxLength = 240,
): string {
  const normalized = normalizeDiagnosticText(value);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseDiagnosticDate(value?: string | number | null): Date | null {
  if (typeof value === "number") {
    const normalizedValue = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(normalizedValue);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

export function formatDiagnosticDateTime(
  value?: string | number | null,
  locale?: string | null,
): string | null {
  const date = parseDiagnosticDate(value);
  if (!date) {
    return null;
  }

  return date.toLocaleString(locale || undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function joinDiagnosticValues(
  values: Array<string | number | boolean | null | undefined>,
  separator: string,
): string {
  return values
    .map((value) => {
      if (value === null || value === undefined) {
        return "";
      }
      return String(value).trim();
    })
    .filter(Boolean)
    .join(separator);
}

function summarizeThreadItemSignals(threadItems: AgentThreadItem[]) {
  const warningItems = threadItems.filter((item) => item.type === "warning");
  const contextCompactionItems = threadItems.filter(
    (item) => item.type === "context_compaction",
  );
  const failedToolCalls = threadItems.filter(
    (item): item is Extract<AgentThreadItem, { type: "tool_call" }> =>
      item.type === "tool_call" &&
      (item.status === "failed" || item.success === false),
  );

  return {
    warningCount: warningItems.length,
    contextCompactionCount: contextCompactionItems.length,
    failedToolCallCount: failedToolCalls.length,
    latestWarnings: warningItems.slice(-3).map((item) => ({
      id: item.id,
      code: item.code || null,
      message: truncateDiagnosticText(item.message, 180),
      status: item.status,
      updated_at: item.updated_at,
    })),
    latestCompactions: contextCompactionItems.slice(-3).map((item) => ({
      id: item.id,
      stage: item.stage,
      trigger: item.trigger || null,
      detail: truncateDiagnosticText(item.detail, 180),
      status: item.status,
      updated_at: item.updated_at,
    })),
    latestFailedTools: failedToolCalls.slice(-3).map((item) => ({
      id: item.id,
      tool_name: item.tool_name,
      error: truncateDiagnosticText(item.error, 180),
      updated_at: item.updated_at,
    })),
  };
}

function summarizeRecentMessages(messages: Message[]) {
  return messages.slice(-6).map((message) => ({
    id: message.id,
    role: message.role,
    timestamp:
      message.timestamp instanceof Date
        ? message.timestamp.toISOString()
        : String(message.timestamp),
    content_preview: truncateDiagnosticText(message.content, 320),
    runtime_status: message.runtimeStatus
      ? {
          phase: message.runtimeStatus.phase,
          title: message.runtimeStatus.title,
          detail: truncateDiagnosticText(message.runtimeStatus.detail, 180),
          checkpoints: message.runtimeStatus.checkpoints?.slice(0, 4) || [],
        }
      : null,
    action_request_count: message.actionRequests?.length || 0,
    action_request_titles:
      message.actionRequests
        ?.slice(0, 3)
        .map((request) =>
          truncateDiagnosticText(
            request.prompt || request.toolName || request.requestId,
            120,
          ),
        ) || [],
    tool_calls:
      message.toolCalls?.slice(0, 4).map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        status: toolCall.status,
        error: truncateDiagnosticText(toolCall.result?.error, 120),
      })) || [],
    context_trace:
      message.contextTrace?.slice(-3).map((step) => ({
        stage: step.stage,
        detail: truncateDiagnosticText(step.detail, 120),
      })) || [],
    artifact_titles:
      message.artifacts?.slice(0, 4).map((artifact) => artifact.title) || [],
  }));
}

function summarizeHarnessState(harnessState?: HarnessSessionState | null) {
  if (!harnessState) {
    return null;
  }

  return {
    runtime_status: harnessState.runtimeStatus
      ? {
          phase: harnessState.runtimeStatus.phase,
          title: harnessState.runtimeStatus.title,
          detail: truncateDiagnosticText(
            harnessState.runtimeStatus.detail,
            220,
          ),
          checkpoints:
            harnessState.runtimeStatus.checkpoints?.slice(0, 6) || [],
          metadata: harnessState.runtimeStatus.metadata || null,
        }
      : null,
    plan: {
      phase: harnessState.plan.phase,
      summary_text: truncateDiagnosticText(harnessState.plan.summaryText, 220),
      items: harnessState.plan.items.slice(0, 6),
    },
    activity: harnessState.activity,
    pending_approvals_count: harnessState.pendingApprovals.length,
    latest_context_trace:
      harnessState.latestContextTrace.slice(-5).map((step) => ({
        stage: step.stage,
        detail: truncateDiagnosticText(step.detail, 160),
      })) || [],
    delegated_tasks: harnessState.delegatedTasks.slice(0, 6).map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      task_type: task.taskType || null,
      role: task.role || null,
      model: task.model || null,
      summary: truncateDiagnosticText(task.summary, 160),
    })),
    output_signals: harnessState.outputSignals.slice(0, 8).map((signal) => ({
      id: signal.id,
      tool_name: signal.toolName,
      title: signal.title,
      summary: truncateDiagnosticText(signal.summary, 180),
      preview: truncateDiagnosticText(signal.preview, 180),
      output_file: signal.outputFile || null,
      offload_file: signal.offloadFile || null,
      artifact_path: signal.artifactPath || null,
      exit_code: signal.exitCode,
      truncated: signal.truncated || false,
      offloaded: signal.offloaded || false,
    })),
    active_file_writes: harnessState.activeFileWrites
      .slice(0, 6)
      .map((write) => ({
        id: write.id,
        path: write.path,
        display_name: write.displayName,
        phase: write.phase,
        status: write.status,
        preview: truncateDiagnosticText(
          write.preview || write.latestChunk,
          160,
        ),
      })),
    recent_file_events: harnessState.recentFileEvents
      .slice(0, 8)
      .map((event) => ({
        id: event.id,
        path: event.path,
        display_name: event.displayName,
        kind: event.kind,
        action: event.action,
        source_tool_name: event.sourceToolName,
        preview: truncateDiagnosticText(event.preview, 140),
      })),
  };
}

export function buildReliabilityDiagnosticText(params: {
  threadRead?: AgentRuntimeThreadReadModel | null;
  statusLabel: string;
  summary: string;
  view: ReturnType<typeof buildThreadReliabilityView>;
  threadItems: AgentThreadItem[];
  messages: Message[];
  harnessState?: HarnessSessionState | null;
  diagnosticRuntimeContext?: AgentThreadReliabilityDiagnosticContext | null;
  agentUiProjectionSummary?: AgentUiProjectionSummary;
  routingEvidenceLineText: RuntimeRoutingEvidenceLineText;
  t: AgentUiProjectionTranslation;
}): string {
  const {
    threadRead,
    statusLabel,
    summary,
    view,
    threadItems,
    messages,
    harnessState,
    diagnosticRuntimeContext,
    agentUiProjectionSummary,
    routingEvidenceLineText,
    t,
  } = params;
  const threadItemSignals = summarizeThreadItemSignals(threadItems);
  const recentMessages = summarizeRecentMessages(messages);
  const runtimeRoutingEvidence = resolveRuntimeRoutingEvidence(threadRead);
  const runtimePolicyEvidence = resolveRuntimePolicyEvidence({
    threadRead,
    decisionReason: runtimeRoutingEvidence.decisionReason,
    fallbackChain: runtimeRoutingEvidence.fallbackChain,
  });
  const unknownLabel = tr(t, "value.unknown");
  const noneLabel = tr(t, "value.nonePlain");
  const noMessageLabel = tr(t, "value.noMessage");
  const noDetailLabel = tr(t, "value.noDetail");
  const yesLabel = tr(t, "value.yes");
  const noLabel = tr(t, "value.no");
  const pipe = tr(t, "separator.pipe");
  const detailSeparator = tr(t, "separator.detail");
  const sections: string[] = [
    tr(t, "title"),
    "",
    tr(t, "intro.role"),
    "",
    tr(t, "intro.conflict"),
    "",
    tr(t, "focus.header"),
    tr(t, "focus.overall"),
    tr(t, "focus.blocker"),
    tr(t, "focus.category"),
    tr(t, "focus.systemic"),
    tr(t, "focus.fix"),
    tr(t, "focus.missing"),
    "",
    tr(t, "output.header"),
    tr(t, "output.conclusion"),
    tr(t, "output.rootCause"),
    tr(t, "output.category"),
    tr(t, "output.fix"),
    tr(t, "output.missing"),
    "",
    "---",
    "",
    tr(t, "sections.data"),
    "",
    tr(t, "sections.environment"),
    bullet(t, "environment.sessionId", {
      value: diagnosticRuntimeContext?.sessionId || unknownLabel,
    }),
    bullet(t, "environment.workspaceId", {
      value: diagnosticRuntimeContext?.workspaceId || unknownLabel,
    }),
    bullet(t, "environment.provider", {
      value: diagnosticRuntimeContext?.providerType || unknownLabel,
    }),
    bullet(t, "environment.model", {
      value: diagnosticRuntimeContext?.model || unknownLabel,
    }),
    bullet(t, "environment.executionStrategy", {
      value: diagnosticRuntimeContext?.executionStrategy || unknownLabel,
    }),
    bullet(t, "environment.theme", {
      value: diagnosticRuntimeContext?.activeTheme || unknownLabel,
    }),
    bullet(t, "environment.workingDir", {
      value: diagnosticRuntimeContext?.workingDir || unknownLabel,
    }),
    "",
    tr(t, "sections.currentStatus"),
    bullet(t, "currentStatus.status", { value: statusLabel }),
    bullet(t, "currentStatus.activeTurn", {
      value: view.activeTurnLabel || unknownLabel,
    }),
    bullet(t, "currentStatus.summary", { value: summary }),
    bullet(t, "currentStatus.updatedAt", {
      value: view.updatedAtLabel || unknownLabel,
    }),
    bullet(t, "currentStatus.interruptState", {
      value: view.interruptStateLabel || noneLabel,
    }),
    "",
    tr(t, "sections.coreMetrics"),
    bullet(t, "metrics.pendingRequests", {
      count: view.pendingRequestCount,
    }),
    bullet(t, "metrics.activeIncidents", {
      count: view.activeIncidentCount,
    }),
    bullet(t, "metrics.queuedTurns", { count: view.queuedTurnCount }),
    "",
    tr(t, "sections.routing"),
    ...buildRuntimeRoutingEvidenceLines(
      runtimeRoutingEvidence,
      routingEvidenceLineText,
    ),
    ...buildRuntimePolicyEvidenceLines(
      runtimePolicyEvidence,
      routingEvidenceLineText,
    ),
    "",
    tr(t, "sections.threadSignals"),
    bullet(t, "threadSignals.warningCount", {
      count: threadItemSignals.warningCount,
    }),
    bullet(t, "threadSignals.contextCompactionCount", {
      count: threadItemSignals.contextCompactionCount,
    }),
    bullet(t, "threadSignals.failedToolCallCount", {
      count: threadItemSignals.failedToolCallCount,
    }),
    "",
    tr(t, "sections.harness"),
    bullet(t, "harness.runtimeStatus", {
      value: harnessState?.runtimeStatus?.title || noneLabel,
    }),
    bullet(t, "harness.planPhase", {
      value: harnessState?.plan.phase || noneLabel,
    }),
    bullet(t, "harness.planItems", {
      count: harnessState?.plan.items.length || 0,
    }),
    bullet(t, "harness.outputSignals", {
      count: harnessState?.outputSignals.length || 0,
    }),
    bullet(t, "harness.activeFileWrites", {
      count: harnessState?.activeFileWrites.length || 0,
    }),
    bullet(t, "harness.recentFileEvents", {
      count: harnessState?.recentFileEvents.length || 0,
    }),
    bullet(t, "harness.delegatedTasks", {
      count: harnessState?.delegatedTasks.length || 0,
    }),
    bullet(t, "harness.contextTraceSteps", {
      count: harnessState?.latestContextTrace.length || 0,
    }),
    "",
    tr(t, "sections.pendingRequests"),
  ];

  if (view.pendingRequests.length > 0) {
    for (const request of view.pendingRequests) {
      sections.push(
        `- ${joinDiagnosticValues(
          [
            request.title,
            request.typeLabel,
            request.statusLabel,
            request.waitingLabel,
          ],
          pipe,
        )}`,
      );
    }
  } else {
    sections.push(bullet(t, "value.none"));
  }

  sections.push("", tr(t, "sections.submittedRequests"));
  if (view.submittedRequests.length > 0) {
    for (const request of view.submittedRequests) {
      sections.push(
        `- ${joinDiagnosticValues(
          [request.title, request.typeLabel, request.statusLabel],
          pipe,
        )}`,
      );
    }
  } else {
    sections.push(bullet(t, "value.none"));
  }

  sections.push("", tr(t, "sections.incident"));
  if (view.incidents.length > 0) {
    for (const incident of view.incidents) {
      sections.push(
        `- ${joinDiagnosticValues(
          [
            incident.title,
            incident.incidentType,
            incident.severityLabel,
            incident.statusLabel,
            incident.detail,
          ],
          pipe,
        )}`,
      );
    }
  } else {
    sections.push(bullet(t, "value.none"));
  }

  sections.push("", tr(t, "sections.outcome"));
  if (view.outcome) {
    sections.push(bullet(t, "outcome.label", { value: view.outcome.label }));
    sections.push(
      bullet(t, "outcome.summary", { value: view.outcome.summary }),
    );
    sections.push(
      bullet(t, "outcome.primaryCause", {
        value: view.outcome.primaryCause || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "outcome.retryable", {
        value: view.outcome.retryable ? yesLabel : noLabel,
      }),
    );
    sections.push(
      bullet(t, "outcome.endedAt", {
        value: view.outcome.endedAtLabel || unknownLabel,
      }),
    );
  } else {
    sections.push(bullet(t, "outcome.noneStable"));
  }

  sections.push("", tr(t, "sections.nextQueuedTurn"));
  if (view.nextQueuedTurn) {
    sections.push(
      `- ${joinDiagnosticValues(
        [view.nextQueuedTurn.title, view.nextQueuedTurn.positionLabel],
        pipe,
      )}`,
    );
  } else {
    sections.push(bullet(t, "value.none"));
  }

  sections.push("", tr(t, "sections.recommendations"));
  if (view.recommendations.length > 0) {
    for (const recommendation of view.recommendations) {
      sections.push(`- ${recommendation}`);
    }
  } else {
    sections.push(bullet(t, "recommendations.none"));
  }

  sections.push("", tr(t, "sections.projection"));
  if (agentUiProjectionSummary?.total) {
    sections.push(
      bullet(t, "projection.total", { count: agentUiProjectionSummary.total }),
    );
    sections.push(
      bullet(t, "projection.action", {
        count: agentUiProjectionSummary.actionCount,
      }),
    );
    sections.push(
      bullet(t, "projection.task", {
        count: agentUiProjectionSummary.taskCount,
      }),
    );
    sections.push(
      bullet(t, "projection.artifact", {
        count: agentUiProjectionSummary.artifactCount,
      }),
    );
    sections.push(
      bullet(t, "projection.evidence", {
        count: agentUiProjectionSummary.evidenceCount,
      }),
    );
    sections.push(
      bullet(t, "projection.diagnostics", {
        count: agentUiProjectionSummary.diagnosticsCount,
      }),
    );
    sections.push(
      bullet(t, "projection.latestEvents", {
        value: agentUiProjectionSummary.latestNotableEvents
          .slice(0, 5)
          .map((event) =>
            joinDiagnosticValues(
              [
                formatAgentUiProjectionEventType(event.type, t),
                formatAgentUiProjectionPhase(event.phase, t),
                formatAgentUiProjectionEventDetail(event),
              ],
              pipe,
            ),
          )
          .join(detailSeparator),
      }),
    );
  } else {
    sections.push(bullet(t, "value.none"));
  }

  sections.push("", tr(t, "sections.warnings"));
  if (threadItemSignals.latestWarnings.length > 0) {
    for (const warning of threadItemSignals.latestWarnings) {
      sections.push(
        `- ${joinDiagnosticValues(
          [
            warning.code || "warning",
            warning.message || noMessageLabel,
            warning.status,
          ],
          pipe,
        )}`,
      );
    }
  } else {
    sections.push(bullet(t, "value.none"));
  }

  sections.push("", tr(t, "sections.compactions"));
  if (threadItemSignals.latestCompactions.length > 0) {
    for (const compaction of threadItemSignals.latestCompactions) {
      sections.push(
        `- ${joinDiagnosticValues(
          [
            compaction.stage,
            compaction.trigger || tr(t, "value.unknownTrigger"),
            compaction.detail || noDetailLabel,
          ],
          pipe,
        )}`,
      );
    }
  } else {
    sections.push(bullet(t, "value.none"));
  }

  sections.push("", tr(t, "sections.compactionBoundary"));
  if (threadRead?.latest_compaction_boundary) {
    const boundary = threadRead.latest_compaction_boundary;
    sections.push(
      bullet(t, "compactionBoundary.createdAt", {
        value: boundary.created_at || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "compactionBoundary.turnCount", {
        value: boundary.turn_count ?? unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "compactionBoundary.trigger", {
        value: boundary.trigger || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "compactionBoundary.summary", {
        value: boundary.summary_preview || tr(t, "value.noSummaryPreview"),
      }),
    );
    sections.push(
      bullet(t, "compactionBoundary.detail", {
        value: boundary.detail || noneLabel,
      }),
    );
  } else {
    sections.push(bullet(t, "value.none"));
  }

  sections.push("", tr(t, "sections.fileCheckpoint"));
  if (threadRead?.file_checkpoint_summary?.latest_checkpoint) {
    const latestCheckpoint =
      threadRead.file_checkpoint_summary.latest_checkpoint;
    sections.push(
      bullet(t, "fileCheckpoint.count", {
        count: threadRead.file_checkpoint_summary.count,
      }),
    );
    sections.push(
      bullet(t, "fileCheckpoint.latestPath", {
        value: latestCheckpoint.path,
      }),
    );
    sections.push(
      bullet(t, "fileCheckpoint.latestVersion", {
        value: latestCheckpoint.version_no ?? unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "fileCheckpoint.updatedAt", {
        value: latestCheckpoint.updated_at || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "fileCheckpoint.summary", {
        value: latestCheckpoint.preview_text || noneLabel,
      }),
    );
  } else {
    sections.push(bullet(t, "value.none"));
  }

  sections.push("", tr(t, "sections.backendDiagnostics"));
  if (threadRead?.diagnostics) {
    const diagnostics = threadRead.diagnostics;
    sections.push(
      bullet(t, "backend.latestTurnStatus", {
        value: diagnostics.latest_turn_status || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.latestTurnStartedAt", {
        value: diagnostics.latest_turn_started_at || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.latestTurnCompletedAt", {
        value: diagnostics.latest_turn_completed_at || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.latestTurnUpdatedAt", {
        value: diagnostics.latest_turn_updated_at || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.latestTurnElapsedSeconds", {
        value: diagnostics.latest_turn_elapsed_seconds ?? unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.latestTurnStalledSeconds", {
        value: diagnostics.latest_turn_stalled_seconds ?? noneLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.latestTurnError", {
        value:
          sanitizeReliabilityDiagnosticText(
            diagnostics.latest_turn_error_message,
            t,
          ) || noneLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.providerSafetyBufferingCount", {
        count: diagnostics.provider_safety_buffering_count ?? 0,
      }),
    );
    sections.push(
      bullet(t, "backend.latestProviderSafetyBuffering", {
        value:
          formatProviderSafetyBufferingDiagnostic(
            diagnostics.latest_provider_safety_buffering,
            t,
          ) || noneLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.interruptReason", {
        value: diagnostics.interrupt_reason || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.interruptSource", {
        value: diagnostics.runtime_interrupt_source || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.interruptRequestedAt", {
        value: diagnostics.runtime_interrupt_requested_at || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.interruptWaitSeconds", {
        value: diagnostics.runtime_interrupt_wait_seconds ?? noneLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.warningCount", { count: diagnostics.warning_count }),
    );
    sections.push(
      bullet(t, "backend.contextCompactionCount", {
        count: diagnostics.context_compaction_count,
      }),
    );
    sections.push(
      bullet(t, "backend.failedToolCallCount", {
        count: diagnostics.failed_tool_call_count,
      }),
    );
    sections.push(
      bullet(t, "backend.failedCommandCount", {
        count: diagnostics.failed_command_count,
      }),
    );
    sections.push(
      bullet(t, "backend.pendingRequestCount", {
        count: diagnostics.pending_request_count,
      }),
    );
    sections.push(
      bullet(t, "backend.oldestPendingRequestWaitSeconds", {
        value: diagnostics.oldest_pending_request_wait_seconds ?? noneLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.primaryBlockingKind", {
        value: diagnostics.primary_blocking_kind || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.primaryBlockingSummary", {
        value:
          sanitizeReliabilityDiagnosticText(
            diagnostics.primary_blocking_summary,
            t,
          ) || unknownLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.latestWarning", {
        value: diagnostics.latest_warning
          ? joinDiagnosticValues(
              [
                diagnostics.latest_warning.code || "warning",
                diagnostics.latest_warning.message,
              ],
              pipe,
            )
          : noneLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.latestContextCompaction", {
        value: diagnostics.latest_context_compaction
          ? joinDiagnosticValues(
              [
                diagnostics.latest_context_compaction.stage,
                diagnostics.latest_context_compaction.trigger ||
                  tr(t, "value.unknownTrigger"),
                diagnostics.latest_context_compaction.detail || noDetailLabel,
              ],
              pipe,
            )
          : noneLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.latestFailedTool", {
        value: diagnostics.latest_failed_tool
          ? joinDiagnosticValues(
              [
                diagnostics.latest_failed_tool.tool_name,
                diagnostics.latest_failed_tool.error ||
                  tr(t, "value.noErrorDetail"),
              ],
              pipe,
            )
          : noneLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.latestFailedCommand", {
        value: diagnostics.latest_failed_command
          ? joinDiagnosticValues(
              [
                diagnostics.latest_failed_command.command,
                `exit=${diagnostics.latest_failed_command.exit_code ?? unknownLabel}`,
                diagnostics.latest_failed_command.error ||
                  tr(t, "value.noErrorDetail"),
              ],
              pipe,
            )
          : noneLabel,
      }),
    );
    sections.push(
      bullet(t, "backend.latestPendingRequest", {
        value: diagnostics.latest_pending_request
          ? joinDiagnosticValues(
              [
                diagnostics.latest_pending_request.request_type,
                diagnostics.latest_pending_request.title ||
                  diagnostics.latest_pending_request.request_id,
                tr(t, "backend.waitingSeconds", {
                  value:
                    diagnostics.latest_pending_request.waited_seconds ??
                    unknownLabel,
                }),
              ],
              pipe,
            )
          : noneLabel,
      }),
    );
  } else {
    sections.push(bullet(t, "value.none"));
  }

  sections.push("", tr(t, "sections.messages"));
  if (recentMessages.length > 0) {
    for (const message of recentMessages) {
      sections.push(
        `- ${joinDiagnosticValues(
          [
            message.role,
            message.timestamp,
            message.content_preview || tr(t, "value.emptyAngle"),
          ],
          pipe,
        )}`,
      );
    }
  } else {
    sections.push(bullet(t, "value.none"));
  }

  return sections.join("\n");
}

export function buildReliabilityRawPayload(params: {
  threadRead?: AgentRuntimeThreadReadModel | null;
  turns: AgentThreadTurn[];
  threadItems: AgentThreadItem[];
  currentTurnId?: string | null;
  pendingActions: ActionRequired[];
  submittedActionsInFlight: ActionRequired[];
  queuedTurns: QueuedTurnSnapshot[];
  view: ReturnType<typeof buildThreadReliabilityView>;
  harnessState?: HarnessSessionState | null;
  messages: Message[];
  diagnosticRuntimeContext?: AgentThreadReliabilityDiagnosticContext | null;
  agentUiProjectionSummary?: AgentUiProjectionSummary;
}): Record<string, unknown> {
  return {
    exported_at: new Date().toISOString(),
    runtime_context: params.diagnosticRuntimeContext || null,
    backend_diagnostics: params.threadRead?.diagnostics || null,
    runtime_routing_evidence: resolveRuntimeRoutingEvidence(params.threadRead),
    runtime_policy_evidence: resolveRuntimePolicyEvidence({
      threadRead: params.threadRead,
    }),
    latest_compaction_boundary:
      params.threadRead?.latest_compaction_boundary || null,
    current_turn_id: params.currentTurnId || null,
    thread_read: params.threadRead || null,
    turns: params.turns,
    thread_items: params.threadItems,
    pending_actions: params.pendingActions,
    submitted_actions_in_flight: params.submittedActionsInFlight,
    queued_turns: params.queuedTurns,
    harness_state: summarizeHarnessState(params.harnessState),
    recent_messages: summarizeRecentMessages(params.messages),
    thread_item_signals: summarizeThreadItemSignals(params.threadItems),
    reliability_view: params.view,
    agent_ui_projection_summary: params.agentUiProjectionSummary || null,
  };
}

export const truncatedDiagnosticText = truncateDiagnosticText;
