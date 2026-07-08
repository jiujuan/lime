import {
  createThreadReliabilityViewTextContext,
  formatTimeLabel,
  shortenText,
} from "./threadReliabilityText";
import {
  hasActiveFailedIncident,
  mergePendingRequests,
  mergeSubmittedRequests,
  resolveLatestTurn,
} from "./threadReliabilityRequests";
import { normalizeOutcome } from "./threadReliabilityOutcome";
import { normalizeIncidents } from "./threadReliabilityIncidents";
import {
  buildRecommendations,
  buildSummary,
  deriveStatusFromRuntime,
  normalizeInterruptStateLabel,
  resolveNextQueuedTurn,
} from "./threadReliabilityStatus";
import type {
  BuildThreadReliabilityViewParams,
  ThreadReliabilitySummaryModel,
  ThreadReliabilityViewModel,
} from "./threadReliabilityTypes";

export function buildThreadReliabilityView(
  params: BuildThreadReliabilityViewParams,
): ThreadReliabilityViewModel {
  const context = createThreadReliabilityViewTextContext(params);
  const turns = params.turns ?? [];
  const threadItems = params.threadItems ?? [];
  const pendingActions = params.pendingActions ?? [];
  const submittedActionsInFlight = params.submittedActionsInFlight ?? [];
  const latestTurn = resolveLatestTurn(turns, params.currentTurnId);
  const activeTurnCandidates = params.threadRead?.active_turn_id
    ? [params.threadRead.active_turn_id]
    : [params.currentTurnId, latestTurn?.id];
  const activeTurnIds = new Set(
    activeTurnCandidates.filter((item): item is string =>
      Boolean(item?.trim()),
    ),
  );
  const allowLocalPendingActions =
    !params.threadRead ||
    (params.threadRead.pending_requests?.length ?? 0) > 0 ||
    !hasActiveFailedIncident(params.threadRead);
  const pendingRequests = mergePendingRequests(
    params.threadRead,
    pendingActions,
    submittedActionsInFlight,
    activeTurnIds,
    allowLocalPendingActions,
    context,
  );
  const submittedRequests = mergeSubmittedRequests(
    submittedActionsInFlight,
    context,
  );
  const queuedTurnCount =
    params.threadRead?.queued_turns?.length ?? params.queuedTurns?.length ?? 0;
  const outcome = normalizeOutcome(
    params.threadRead?.last_outcome,
    latestTurn,
    context,
  );
  const updatedAtLabel = formatTimeLabel(
    params.threadRead?.updated_at,
    context,
  );
  const interruptStateLabel = normalizeInterruptStateLabel(
    params.threadRead?.interrupt_state,
    context,
  );
  const nextQueuedTurn = resolveNextQueuedTurn(
    params.threadRead,
    params.queuedTurns ?? [],
    context,
  );
  const incidents = normalizeIncidents(
    params.threadRead,
    latestTurn,
    threadItems,
    pendingRequests,
    submittedActionsInFlight,
    context,
  );
  const statusMeta = deriveStatusFromRuntime({
    threadRead: params.threadRead,
    latestTurn,
    pendingRequests,
    submittedRequests,
    queuedTurnCount,
    context,
  });

  return {
    shouldRender:
      Boolean(params.threadRead) ||
      turns.length > 0 ||
      pendingRequests.length > 0 ||
      submittedRequests.length > 0 ||
      incidents.length > 0 ||
      queuedTurnCount > 0,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    summary: buildSummary({
      statusLabel: statusMeta.label,
      latestTurn,
      pendingRequests,
      submittedRequests,
      incidents,
      outcome,
      queuedTurnCount,
      interruptState: params.threadRead?.interrupt_state,
      interruptStateLabel,
      nextQueuedTurn,
      context,
    }),
    activeTurnLabel:
      shortenText(latestTurn?.prompt_text, 56) ||
      params.threadRead?.active_turn_id ||
      latestTurn?.id ||
      null,
    updatedAtLabel,
    interruptStateLabel,
    pendingRequestCount: pendingRequests.length,
    activeIncidentCount: incidents.length,
    queuedTurnCount,
    pendingRequests,
    submittedRequests,
    incidents,
    outcome,
    nextQueuedTurn,
    recommendations: buildRecommendations({
      pendingRequests,
      submittedRequests,
      incidents,
      outcome,
      nextQueuedTurn,
      interruptState: params.threadRead?.interrupt_state,
      interruptStateLabel,
      context,
    }),
  };
}

export function buildThreadReliabilitySummary(
  params: Omit<BuildThreadReliabilityViewParams, "threadItems">,
): ThreadReliabilitySummaryModel {
  const context = createThreadReliabilityViewTextContext(params);
  const turns = params.turns ?? [];
  const pendingActions = params.pendingActions ?? [];
  const submittedActionsInFlight = params.submittedActionsInFlight ?? [];
  const latestTurn = resolveLatestTurn(turns, params.currentTurnId);
  const activeTurnCandidates = params.threadRead?.active_turn_id
    ? [params.threadRead.active_turn_id]
    : [params.currentTurnId, latestTurn?.id];
  const activeTurnIds = new Set(
    activeTurnCandidates.filter((item): item is string =>
      Boolean(item?.trim()),
    ),
  );
  const allowLocalPendingActions =
    !params.threadRead ||
    (params.threadRead.pending_requests?.length ?? 0) > 0 ||
    !hasActiveFailedIncident(params.threadRead);
  const pendingRequests = mergePendingRequests(
    params.threadRead,
    pendingActions,
    submittedActionsInFlight,
    activeTurnIds,
    allowLocalPendingActions,
    context,
  );
  const submittedRequests = mergeSubmittedRequests(
    submittedActionsInFlight,
    context,
  );
  const queuedTurnCount =
    params.threadRead?.queued_turns?.length ?? params.queuedTurns?.length ?? 0;
  const outcome = normalizeOutcome(
    params.threadRead?.last_outcome,
    latestTurn,
    context,
  );
  const interruptStateLabel = normalizeInterruptStateLabel(
    params.threadRead?.interrupt_state,
    context,
  );
  const nextQueuedTurn = resolveNextQueuedTurn(
    params.threadRead,
    params.queuedTurns ?? [],
    context,
  );
  const statusMeta = deriveStatusFromRuntime({
    threadRead: params.threadRead,
    latestTurn,
    pendingRequests,
    submittedRequests,
    queuedTurnCount,
    context,
  });

  return {
    shouldRender:
      Boolean(params.threadRead) ||
      turns.length > 0 ||
      pendingRequests.length > 0 ||
      submittedRequests.length > 0 ||
      queuedTurnCount > 0,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    summary: buildSummary({
      statusLabel: statusMeta.label,
      latestTurn,
      pendingRequests,
      submittedRequests,
      incidents: [],
      outcome,
      queuedTurnCount,
      interruptState: params.threadRead?.interrupt_state,
      interruptStateLabel,
      nextQueuedTurn,
      context,
    }),
  };
}
