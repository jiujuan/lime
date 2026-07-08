import type {
  AgentRuntimeThreadReadModel,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import type { AgentThreadTurn } from "../types";
import { isRuntimePermissionConfirmationWaitMessage } from "./runtimeActionConfirmation";
import {
  createThreadReliabilityViewTextContext,
  shortenText,
  viewText,
} from "./threadReliabilityText";
import type {
  ThreadReliabilityIncidentDisplay,
  ThreadReliabilityOutcomeDisplay,
  ThreadReliabilityQueuedTurnDisplay,
  ThreadReliabilityRequestDisplay,
  ThreadReliabilityTone,
  ThreadReliabilityViewTextContext,
} from "./threadReliabilityTypes";

export function normalizeInterruptStateLabel(
  interruptState?: string | null,
  context: ThreadReliabilityViewTextContext = createThreadReliabilityViewTextContext(
    {},
  ),
): string | null {
  const normalized = (interruptState || "").toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.includes("interrupting")) {
    return viewText(
      context,
      "interrupt.interrupting",
      "Runtime is processing the interruption",
    );
  }
  if (normalized.includes("interrupt")) {
    return viewText(
      context,
      "interrupt.interrupted",
      "Runtime confirmed the interruption",
    );
  }
  return shortenText(interruptState, 32);
}

export function resolveNextQueuedTurn(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
  queuedTurns: QueuedTurnSnapshot[],
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityQueuedTurnDisplay | null {
  const candidate =
    threadRead?.queued_turns?.[0] ??
    (queuedTurns.length > 0 ? queuedTurns[0] : null);

  if (!candidate) {
    return null;
  }

  return {
    id: candidate.queued_turn_id,
    title:
      shortenText(candidate.message_preview, 48) ||
      shortenText(candidate.message_text, 48) ||
      viewText(context, "queue.titleFallback", "Continue queued turn"),
    positionLabel:
      candidate.position > 0
        ? viewText(context, "queue.position", "Queue #{{position}}", {
            position: candidate.position,
          })
        : null,
  };
}

function resolveStatusMeta(
  status: string | undefined,
  context: ThreadReliabilityViewTextContext,
): {
  label: string;
  tone: ThreadReliabilityTone;
} {
  const normalized = (status || "").toLowerCase();
  if (normalized.includes("interrupting")) {
    return {
      label: viewText(context, "status.interrupting", "Interrupting"),
      tone: "paused",
    };
  }
  if (normalized.includes("wait") || normalized.includes("queue")) {
    return {
      label: viewText(context, "status.waiting", "Waiting"),
      tone: "waiting",
    };
  }
  if (normalized.includes("interrupt") || normalized.includes("abort")) {
    return {
      label: viewText(context, "status.interrupted", "Interrupted"),
      tone: "paused",
    };
  }
  if (normalized.includes("run") || normalized.includes("active")) {
    return {
      label: viewText(context, "status.running", "Running"),
      tone: "running",
    };
  }
  if (
    normalized.includes("complete") ||
    normalized.includes("done") ||
    normalized.includes("success")
  ) {
    return {
      label: viewText(context, "status.completed", "Completed"),
      tone: "completed",
    };
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return {
      label: viewText(context, "status.failed", "Failed"),
      tone: "failed",
    };
  }
  return {
    label: viewText(context, "status.idle", "Idle"),
    tone: "neutral",
  };
}

export function deriveStatusFromRuntime(params: {
  threadRead?: AgentRuntimeThreadReadModel | null;
  latestTurn: AgentThreadTurn | null;
  pendingRequests: ThreadReliabilityRequestDisplay[];
  submittedRequests: ThreadReliabilityRequestDisplay[];
  queuedTurnCount: number;
  context: ThreadReliabilityViewTextContext;
}): { label: string; tone: ThreadReliabilityTone } {
  if (params.submittedRequests.length > 0) {
    return {
      label: viewText(params.context, "status.processing", "Processing"),
      tone: "running",
    };
  }
  if (params.threadRead?.status) {
    return resolveStatusMeta(params.threadRead.status, params.context);
  }

  if (params.pendingRequests.length > 0) {
    return {
      label: viewText(params.context, "status.waiting", "Waiting"),
      tone: "waiting",
    };
  }

  if (params.latestTurn?.status === "running") {
    return {
      label: viewText(params.context, "status.running", "Running"),
      tone: "running",
    };
  }
  if (params.latestTurn?.status === "completed") {
    return {
      label: viewText(params.context, "status.completed", "Completed"),
      tone: "completed",
    };
  }
  if (params.latestTurn?.status === "failed") {
    if (
      isRuntimePermissionConfirmationWaitMessage(
        params.latestTurn.error_message,
      )
    ) {
      return {
        label: viewText(params.context, "status.waiting", "Waiting"),
        tone: "waiting",
      };
    }
    return {
      label: viewText(params.context, "status.failed", "Failed"),
      tone: "failed",
    };
  }
  if (params.latestTurn?.status === "aborted") {
    return {
      label: viewText(params.context, "status.interrupted", "Interrupted"),
      tone: "paused",
    };
  }
  if (params.queuedTurnCount > 0) {
    return {
      label: viewText(params.context, "status.waiting", "Waiting"),
      tone: "waiting",
    };
  }

  return {
    label: viewText(params.context, "status.idle", "Idle"),
    tone: "neutral",
  };
}

export function buildSummary(params: {
  statusLabel: string;
  latestTurn: AgentThreadTurn | null;
  pendingRequests: ThreadReliabilityRequestDisplay[];
  submittedRequests: ThreadReliabilityRequestDisplay[];
  incidents: ThreadReliabilityIncidentDisplay[];
  outcome: ThreadReliabilityOutcomeDisplay | null;
  queuedTurnCount: number;
  interruptState?: string | null;
  interruptStateLabel?: string | null;
  nextQueuedTurn: ThreadReliabilityQueuedTurnDisplay | null;
  context: ThreadReliabilityViewTextContext;
}): string {
  if (params.pendingRequests.length > 0) {
    return viewText(
      params.context,
      "summary.pendingRequest",
      "Current thread is waiting for user action: {{title}}",
      {
        title:
          params.pendingRequests[0]?.title ||
          viewText(
            params.context,
            "summary.pendingRequestFallback",
            "Review pending requests",
          ),
      },
    );
  }

  if (params.submittedRequests.length > 0) {
    return viewText(
      params.context,
      "summary.submittedRequest",
      "Submitted response: {{title}}. Waiting for runtime to refresh status.",
      {
        title:
          params.submittedRequests[0]?.title ||
          viewText(
            params.context,
            "summary.submittedRequestFallback",
            "Waiting for thread to continue",
          ),
      },
    );
  }

  if (params.incidents.length > 0) {
    return params.incidents[0]?.detail
      ? viewText(
          params.context,
          "summary.incidentWithDetail",
          "{{title}}: {{detail}}",
          {
            title: params.incidents[0].title,
            detail: params.incidents[0].detail,
          },
        )
      : params.incidents[0].title;
  }

  if (params.interruptStateLabel) {
    if ((params.interruptState || "").toLowerCase().includes("interrupting")) {
      return viewText(
        params.context,
        "summary.interrupting",
        "{{state}}. Wait for runtime to refresh the final status.",
        { state: params.interruptStateLabel },
      );
    }
    if (params.nextQueuedTurn) {
      return viewText(
        params.context,
        "summary.interruptedWithNext",
        "{{state}}. You can continue {{title}}.",
        {
          state: params.interruptStateLabel,
          title: params.nextQueuedTurn.title,
        },
      );
    }
    return viewText(
      params.context,
      "summary.interrupted",
      "{{state}}. Start a new turn if you need to continue.",
      { state: params.interruptStateLabel },
    );
  }

  if (params.latestTurn?.status === "running") {
    return viewText(
      params.context,
      "summary.running",
      "Current thread is running: {{title}}",
      {
        title:
          shortenText(params.latestTurn.prompt_text, 52) ||
          viewText(params.context, "summary.runningFallback", "Processing"),
      },
    );
  }

  if (params.outcome) {
    return params.outcome.summary;
  }

  if (params.queuedTurnCount > 0) {
    return viewText(
      params.context,
      "summary.queuedTurns",
      "{{count}} queued turns are waiting to run",
      { count: params.queuedTurnCount },
    );
  }

  return viewText(
    params.context,
    "summary.status",
    "Current thread status: {{status}}",
    { status: params.statusLabel },
  );
}

export function buildRecommendations(params: {
  pendingRequests: ThreadReliabilityRequestDisplay[];
  submittedRequests: ThreadReliabilityRequestDisplay[];
  incidents: ThreadReliabilityIncidentDisplay[];
  outcome: ThreadReliabilityOutcomeDisplay | null;
  nextQueuedTurn: ThreadReliabilityQueuedTurnDisplay | null;
  interruptState?: string | null;
  interruptStateLabel?: string | null;
  context: ThreadReliabilityViewTextContext;
}): string[] {
  const recommendations = new Set<string>();
  const incidentTypes = new Set(
    params.incidents.map((incident) => incident.incidentType),
  );

  if (params.pendingRequests.length > 0) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.pendingRequest",
        "Respond to the current pending request first",
      ),
    );
  }
  if (params.submittedRequests.length > 0) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.submittedRequest",
        "Wait for runtime to refresh the latest status",
      ),
    );
  }
  if (params.incidents.some((incident) => incident.tone === "failed")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.failedIncident",
        "Handle high-priority incidents first",
      ),
    );
  }
  if (incidentTypes.has("approval_timeout")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.approvalTimeout",
        "Approval has been waiting too long; handle it soon or stop this run",
      ),
    );
  }
  if (incidentTypes.has("user_input_timeout")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.userInputTimeout",
        "User input has been waiting too long; add input and continue the thread",
      ),
    );
  }
  if (incidentTypes.has("turn_stuck")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.turnStuck",
        "The current turn has stalled; stop it and resume execution",
      ),
    );
  }
  if (incidentTypes.has("provider_error")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.providerError",
        "Provider failures are usually retryable; resume later or resend the turn",
      ),
    );
  }
  if (incidentTypes.has("tool_failed")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.toolFailed",
        "Check the failed tool's parameters or environment before retrying",
      ),
    );
  }
  if (params.interruptStateLabel) {
    if ((params.interruptState || "").toLowerCase().includes("interrupting")) {
      recommendations.add(
        viewText(
          params.context,
          "recommendation.interrupting",
          "Stopping the current run; wait for runtime to refresh the final status",
        ),
      );
    } else {
      recommendations.add(
        viewText(
          params.context,
          "recommendation.interrupted",
          "Runtime has confirmed this run was interrupted",
        ),
      );
    }
  }
  if (
    params.nextQueuedTurn &&
    !(params.interruptState || "").toLowerCase().includes("interrupting")
  ) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.nextQueuedTurn",
        "Continue queued turn: {{title}}",
        { title: params.nextQueuedTurn.title },
      ),
    );
  }
  if (params.outcome?.retryable) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.retryable",
        "The latest result supports retry; resume or start a new turn",
      ),
    );
  }
  if ((params.outcome?.outcomeType || "").toLowerCase().includes("provider")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.providerError",
        "Provider failures are usually retryable; resume later or resend the turn",
      ),
    );
  }
  if ((params.outcome?.outcomeType || "").toLowerCase().includes("tool")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.toolFailed",
        "Check the failed tool's parameters or environment before retrying",
      ),
    );
  }

  return [...recommendations];
}
