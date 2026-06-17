import {
  normalizeQueuedTurnSnapshot,
  type QueuedTurnSnapshot,
} from "./queuedTurn";
import {
  normalizeLegacyRuntimeStatusTitle,
  normalizeLegacyThreadItem,
} from "./agentTextNormalization";
import type {
  AsterSessionExecutionRuntimeCostState,
  AsterSessionExecutionRuntimeLimitEvent,
  AsterSessionExecutionRuntimeLimitState,
  AsterSessionExecutionRuntimeRoutingDecision,
  AsterSessionExecutionRuntimeTaskProfile,
  AsterTurnOutputSchemaRuntime,
} from "./agentExecutionRuntime";
import type {
  AsterApprovalPolicy,
  AsterProviderConfig,
  AgentRuntimeSubmitTurnRequest,
  AgentRuntimeWebSearchMode,
  AsterExecutionStrategy,
  AsterSandboxPolicy,
  AutoContinueRequestPayload,
  ImageInput,
} from "./agentRuntime/types";
import { normalizeExecutionStrategyToReact } from "./agentRuntime/executionStrategyCompat";

export interface AgentContextTraceStep {
  stage: string;
  detail: string;
}

export interface AgentToolResultImage {
  src: string;
  mimeType?: string;
  origin?: "data_url" | "tool_payload" | "file_path";
}

export type AgentToolResultMetadata = Record<string, unknown>;

export interface AgentToolExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  images?: AgentToolResultImage[];
  metadata?: AgentToolResultMetadata;
}

export interface AgentMessageContentText {
  type: "text";
  text: string;
}

export interface AgentMessageContentThinking {
  type: "thinking";
  text: string;
}

export interface AgentMessageContentToolRequest {
  type: "tool_request";
  id: string;
  tool_name: string;
  arguments: unknown;
}

export interface AgentMessageContentToolResponse {
  type: "tool_response";
  id: string;
  success: boolean;
  output: string;
  error?: string;
  images?: AgentToolResultImage[];
  metadata?: AgentToolResultMetadata;
}

export interface AgentMessageContentActionRequired {
  type: "action_required";
  id: string;
  action_type: AgentActionRequiredType | string;
  data: unknown;
  scope?: AgentActionRequiredScope;
}

export interface AgentMessageContentImage {
  type: "image";
  mime_type: string;
  data: string;
}

export type AgentMessageContent =
  | AgentMessageContentText
  | AgentMessageContentThinking
  | AgentMessageContentToolRequest
  | AgentMessageContentToolResponse
  | AgentMessageContentActionRequired
  | AgentMessageContentImage;

export interface AgentMessage {
  id?: string;
  role: string;
  content: AgentMessageContent[];
  timestamp: number;
  runtimeTurnId?: string;
  runtime_turn_id?: string;
  usage?: AgentTokenUsage;
}

export interface AgentArtifactSignal {
  artifactId: string;
  filePath?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTokenUsage {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export type AgentThreadTurnStatus =
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "aborted"
  | "cancelled"
  | "interrupted";

export type AgentThreadItemStatus = "in_progress" | "completed" | "failed";

export interface AgentThreadTurn {
  id: string;
  thread_id: string;
  prompt_text: string;
  status: AgentThreadTurnStatus;
  started_at: string;
  completed_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentRequestOption {
  label: string;
  description?: string;
}

export interface AgentRequestQuestion {
  question: string;
  header?: string;
  options?: AgentRequestOption[];
  multi_select?: boolean;
}

interface AgentThreadItemBase {
  id: string;
  thread_id: string;
  turn_id: string;
  sequence: number;
  status: AgentThreadItemStatus;
  started_at: string;
  completed_at?: string;
  updated_at: string;
  metadata?: unknown;
}

export interface AgentThreadUserMessageItem extends AgentThreadItemBase {
  type: "user_message";
  content: string;
}

export interface AgentThreadAgentMessageItem extends AgentThreadItemBase {
  type: "agent_message";
  text: string;
  phase?: string;
}

export interface AgentThreadPlanItem extends AgentThreadItemBase {
  type: "plan";
  text: string;
}

export interface AgentThreadReasoningItem extends AgentThreadItemBase {
  type: "reasoning";
  text: string;
  summary?: string[];
}

export interface AgentThreadToolCallItem extends AgentThreadItemBase {
  type: "tool_call";
  tool_name: string;
  arguments?: unknown;
  output?: string;
  success?: boolean;
  error?: string;
  metadata?: unknown;
}

export interface AgentThreadCommandExecutionItem extends AgentThreadItemBase {
  type: "command_execution";
  command: string;
  cwd: string;
  aggregated_output?: string;
  exit_code?: number;
  error?: string;
}

export interface AgentThreadPatchItem extends AgentThreadItemBase {
  type: "patch";
  text: string;
  summary?: string[];
  paths?: string[];
  success?: boolean;
  stdout?: string;
  stderr?: string;
  metadata?: unknown;
}

export interface AgentThreadWebSearchItem extends AgentThreadItemBase {
  type: "web_search";
  query?: string;
  action?: string;
  output?: string;
}

export interface AgentThreadApprovalRequestItem extends AgentThreadItemBase {
  type: "approval_request";
  request_id: string;
  action_type: string;
  prompt?: string;
  tool_name?: string;
  arguments?: unknown;
  response?: unknown;
}

export interface AgentThreadRequestUserInputItem extends AgentThreadItemBase {
  type: "request_user_input";
  request_id: string;
  action_type: string;
  prompt?: string;
  questions?: AgentRequestQuestion[];
  response?: unknown;
}

export interface AgentThreadFileArtifactItem extends AgentThreadItemBase {
  type: "file_artifact";
  path: string;
  source: string;
  content?: string;
  metadata?: unknown;
}

export interface AgentThreadSubagentActivityItem extends AgentThreadItemBase {
  type: "subagent_activity";
  status_label: string;
  title?: string;
  summary?: string;
  role?: string;
  model?: string;
  session_id?: string;
}

export interface AgentThreadWarningItem extends AgentThreadItemBase {
  type: "warning";
  message: string;
  code?: string;
}

export interface AgentThreadContextCompactionItem extends AgentThreadItemBase {
  type: "context_compaction";
  stage: "started" | "completed" | string;
  trigger?: string;
  detail?: string;
}

export interface AgentThreadErrorItem extends AgentThreadItemBase {
  type: "error";
  message: string;
}

export interface AgentThreadTurnSummaryItem extends AgentThreadItemBase {
  type: "turn_summary";
  text: string;
  metadata?: Record<string, unknown>;
}

export type AgentThreadItem =
  | AgentThreadUserMessageItem
  | AgentThreadAgentMessageItem
  | AgentThreadPlanItem
  | AgentThreadReasoningItem
  | AgentThreadToolCallItem
  | AgentThreadCommandExecutionItem
  | AgentThreadPatchItem
  | AgentThreadWebSearchItem
  | AgentThreadApprovalRequestItem
  | AgentThreadRequestUserInputItem
  | AgentThreadFileArtifactItem
  | AgentThreadSubagentActivityItem
  | AgentThreadWarningItem
  | AgentThreadContextCompactionItem
  | AgentThreadErrorItem
  | AgentThreadTurnSummaryItem;

export interface AgentToolCallState {
  id: string;
  name: string;
  arguments?: string;
  status: "running" | "completed" | "failed";
  result?: AgentToolExecutionResult;
  metadata?: Record<string, unknown>;
  progress?: AgentToolProgressPayload & { updatedAt?: Date };
  startTime: Date;
  endTime?: Date;
  logs?: string[];
}

export interface AgentActionRequiredScope {
  session_id?: string;
  thread_id?: string;
  turn_id?: string;
}

export type AgentActionRequiredType =
  | "tool_confirmation"
  | "ask_user"
  | "elicitation";

export interface AgentActionRequiredOption {
  label: string;
  description?: string;
}

export interface AgentActionRequiredQuestion {
  question: string;
  header?: string;
  options?: AgentActionRequiredOption[];
  multiSelect?: boolean;
}

export interface AgentEventTextDelta {
  type: "text_delta";
  text: string;
}

export type AgentEventTextDeltaBatchBoundary =
  | "newline"
  | "backlog"
  | "final"
  | "provider"
  | (string & {});

export interface AgentEventTextDeltaBatch {
  type: "text_delta_batch";
  text: string;
  chunks: string[];
  boundary: AgentEventTextDeltaBatchBoundary;
}

export interface AgentEventThreadStarted {
  type: "thread_started";
  thread_id: string;
}

export interface AgentEventTurnStarted {
  type: "turn_started";
  turn: AgentThreadTurn;
}

export interface AgentEventItemStarted {
  type: "item_started";
  item: AgentThreadItem;
}

export interface AgentEventItemUpdated {
  type: "item_updated";
  item: AgentThreadItem;
}

export interface AgentEventItemCompleted {
  type: "item_completed";
  item: AgentThreadItem;
}

export interface AgentEventTurnCompleted {
  type: "turn_completed";
  turn: AgentThreadTurn;
  text?: string;
  usage?: AgentTokenUsage;
}

export interface AgentEventTurnFailed {
  type: "turn_failed";
  turn: AgentThreadTurn;
}

export interface AgentEventTurnCanceled {
  type: "turn_canceled";
  turn: AgentThreadTurn;
}

export interface AgentEventThinkingDelta {
  type: "thinking_delta";
  text: string;
}

export interface AgentEventToolStart {
  type: "tool_start";
  tool_name: string;
  tool_id: string;
  arguments?: string;
}

export interface AgentEventToolEnd {
  type: "tool_end";
  tool_id: string;
  result: AgentToolExecutionResult;
}

export interface AgentToolProgressPayload {
  message?: string;
  progress?: number;
  total?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentEventToolProgress {
  type: "tool_progress";
  tool_id: string;
  progress: AgentToolProgressPayload;
}

export interface AgentEventToolOutputDelta {
  type: "tool_output_delta";
  tool_id: string;
  delta: string;
  output_kind?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentEventToolInputDelta {
  type: "tool_input_delta";
  tool_id: string;
  tool_name?: string;
  delta: string;
  accumulated_arguments?: string;
  provider?: string;
}

export interface AgentEventArtifactSnapshot {
  type: "artifact_snapshot";
  artifact: AgentArtifactSignal;
}

export interface AgentEventActionRequired {
  type: "action_required";
  request_id: string;
  action_type: AgentActionRequiredType;
  scope?: AgentActionRequiredScope;
  tool_name?: string;
  arguments?: Record<string, unknown>;
  prompt?: string;
  questions?: AgentActionRequiredQuestion[];
  requested_schema?: Record<string, unknown>;
}

export interface AgentEventActionResolved {
  type: "action_resolved";
  request_id: string;
  action_type: AgentActionRequiredType | "plan_approval" | string;
  scope?: AgentActionRequiredScope;
  approved?: boolean;
  feedback?: string;
  permission_mode?: string;
  data?: Record<string, unknown>;
}

export interface AgentEventContextTrace {
  type: "context_trace";
  steps: AgentContextTraceStep[];
}

export interface AgentContextBudget {
  used_tokens?: number;
  max_tokens?: number;
  remaining_tokens?: number;
  status?: string;
  source?: string;
}

export interface AgentMissingContextFact {
  id?: string;
  kind: string;
  label: string;
  status: string;
  reason?: string;
  source?: string;
}

export interface AgentRetrievalRef {
  source_id: string;
  kind: string;
  title?: string;
  path?: string;
  url?: string;
  score?: number;
  scope?: string;
  status?: string;
  source?: string;
}

export interface AgentTeamMemoryRef {
  key: string;
  repo_scope?: string;
  updated_at?: number;
  priority?: number;
  source?: string;
}

export interface AgentTurnContextSummary {
  memory_budget?: AgentContextBudget | null;
  missing_context?: AgentMissingContextFact[];
  retrieval_refs?: AgentRetrievalRef[];
  team_memory_refs?: AgentTeamMemoryRef[];
}

export interface AgentEventTurnContext {
  type: "turn_context";
  session_id: string;
  thread_id: string;
  turn_id: string;
  execution_strategy?: AsterExecutionStrategy | null;
  output_schema_runtime?: AsterTurnOutputSchemaRuntime | null;
  context_summary?: AgentTurnContextSummary | null;
  approval_policy?: string | null;
  sandbox_policy?: string | null;
}

export interface AgentEventModelChange {
  type: "model_change";
  model: string;
  mode: string;
}

export interface AgentRuntimeStatusMetadata {
  [key: string]: unknown;
  sourceType?: string;
  source?: string;
  kind?: string;
  eventClass?: string;
  event_class?: string;
  surface?: string;
  visibility?: string;
  persistence?: string;
  presentation?: string;
  agentui?: Record<string, unknown>;
  agentUi?: Record<string, unknown>;
  team_phase?: string;
  team_parallel_budget?: number;
  team_active_count?: number;
  team_queued_count?: number;
  concurrency_phase?: string;
  concurrency_scope?: string;
  concurrency_active_count?: number;
  concurrency_queued_count?: number;
  concurrency_budget?: number;
  provider_concurrency_group?: string;
  provider_parallel_budget?: number;
  queue_reason?: string;
  retryable_overload?: boolean;
  permission_status?: string;
  required_profile_keys?: string[];
  ask_profile_keys?: string[];
  blocking_profile_keys?: string[];
  decision_source?: string;
  decision_scope?: string;
  confirmation_status?: string;
  confirmation_request_id?: string;
  confirmation_source?: string;
  declared_only?: boolean;
  turn_gating?: boolean;
  limit_status?: string;
  capability_gap?: string;
  keepalive_kind?: string;
  keepalive_sequence?: number;
  keepalive_elapsed_ms?: number;
}

export interface AgentRuntimeStatusPayload {
  phase:
    | "preparing"
    | "routing"
    | "context"
    | "permission_review"
    | "retrying"
    | "continuing"
    | "synthesizing"
    | "failed";
  title: string;
  detail: string;
  checkpoints?: string[];
  metadata?: AgentRuntimeStatusMetadata;
}

export interface AgentEventRuntimeStatus {
  type: "runtime_status";
  status: AgentRuntimeStatusPayload;
}

export interface AgentEventTaskProfileResolved {
  type: "task_profile_resolved";
  task_profile: AsterSessionExecutionRuntimeTaskProfile;
}

export interface AgentEventCandidateSetResolved {
  type: "candidate_set_resolved";
  routing_decision: AsterSessionExecutionRuntimeRoutingDecision;
}

export interface AgentEventRoutingDecisionMade {
  type: "routing_decision_made";
  routing_decision: AsterSessionExecutionRuntimeRoutingDecision;
}

export interface AgentEventRoutingFallbackApplied {
  type: "routing_fallback_applied";
  routing_decision: AsterSessionExecutionRuntimeRoutingDecision;
}

export interface AgentEventRoutingNotPossible {
  type: "routing_not_possible";
  routing_decision: AsterSessionExecutionRuntimeRoutingDecision;
}

function routingDecisionFromEvent(
  event: Record<string, unknown>,
): AsterSessionExecutionRuntimeRoutingDecision {
  const routingDecision =
    (event.routing_decision as Record<string, unknown> | undefined) ||
    (event.routingDecision as Record<string, unknown> | undefined) ||
    {};
  const merged: Record<string, unknown> = { ...routingDecision };
  for (const [sourceKey, targetKey] of [
    ["fallbackApplied", "fallbackApplied"],
    ["fallback_applied", "fallbackApplied"],
    ["requestedSelection", "requestedSelection"],
    ["requested_selection", "requestedSelection"],
    ["routingAttempts", "routingAttempts"],
    ["routing_attempts", "routingAttempts"],
  ] as const) {
    if (event[sourceKey] !== undefined && merged[targetKey] === undefined) {
      merged[targetKey] = event[sourceKey];
    }
  }
  return merged as unknown as AsterSessionExecutionRuntimeRoutingDecision;
}

export interface AgentEventLimitStateUpdated {
  type: "limit_state_updated";
  limit_state: AsterSessionExecutionRuntimeLimitState;
}

export interface AgentEventSingleCandidateOnly {
  type: "single_candidate_only";
  limit_state: AsterSessionExecutionRuntimeLimitState;
}

export interface AgentEventSingleCandidateCapabilityGap {
  type: "single_candidate_capability_gap";
  limit_state: AsterSessionExecutionRuntimeLimitState;
}

export interface AgentEventCostEstimated {
  type: "cost_estimated";
  cost_state: AsterSessionExecutionRuntimeCostState;
}

export interface AgentEventCostRecorded {
  type: "cost_recorded";
  cost_state: AsterSessionExecutionRuntimeCostState;
}

export interface AgentEventRateLimitHit {
  type: "rate_limit_hit";
  limit_event: AsterSessionExecutionRuntimeLimitEvent;
}

export interface AgentEventQuotaLow {
  type: "quota_low";
  limit_event: AsterSessionExecutionRuntimeLimitEvent;
}

export interface AgentEventQuotaBlocked {
  type: "quota_blocked";
  limit_event: AsterSessionExecutionRuntimeLimitEvent;
}

export interface AgentEventQueueAdded {
  type: "queue_added";
  session_id: string;
  queued_turn: QueuedTurnSnapshot;
}

export interface AgentEventQueueRemoved {
  type: "queue_removed";
  session_id: string;
  queued_turn_id: string;
}

export interface AgentEventQueueStarted {
  type: "queue_started";
  session_id: string;
  queued_turn_id: string;
}

export interface AgentEventQueueCleared {
  type: "queue_cleared";
  session_id: string;
  queued_turn_ids: string[];
}

export type AgentSubagentRuntimeStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "aborted"
  | "closed"
  | "not_found";

export interface AgentEventSubagentStatusChanged {
  type: "subagent_status_changed";
  session_id: string;
  root_session_id: string;
  parent_session_id?: string;
  status: AgentSubagentRuntimeStatus;
  latest_turn_id?: string;
  latest_turn_status?: AgentSubagentRuntimeStatus;
  queued_turn_count?: number;
  team_phase?: string;
  team_parallel_budget?: number;
  team_active_count?: number;
  team_queued_count?: number;
  provider_concurrency_group?: string;
  provider_parallel_budget?: number;
  queue_reason?: string;
  retryable_overload?: boolean;
  closed?: boolean;
  usage?: AgentTokenUsage;
  duration_ms?: number;
  tool_count?: number;
  result_ref?: string;
}

export interface AgentEventMessage {
  type: "message";
  message: AgentMessage;
}

export interface AgentEventWarning {
  type: "warning";
  code?: string;
  message: string;
}

export interface AgentEventError {
  type: "error";
  message: string;
}

export interface AgentEventEnvelope {
  event_id?: string;
  sequence?: number;
  session_id?: string;
  thread_id?: string;
  turn_id?: string;
  timestamp?: string;
}

export type AgentEvent = (
  | AgentEventThreadStarted
  | AgentEventTurnStarted
  | AgentEventItemStarted
  | AgentEventItemUpdated
  | AgentEventItemCompleted
  | AgentEventTurnCompleted
  | AgentEventTurnFailed
  | AgentEventTurnCanceled
  | AgentEventTextDelta
  | AgentEventTextDeltaBatch
  | AgentEventThinkingDelta
  | AgentEventToolStart
  | AgentEventToolEnd
  | AgentEventToolProgress
  | AgentEventToolOutputDelta
  | AgentEventToolInputDelta
  | AgentEventArtifactSnapshot
  | AgentEventActionRequired
  | AgentEventActionResolved
  | AgentEventTurnContext
  | AgentEventModelChange
  | AgentEventContextTrace
  | AgentEventRuntimeStatus
  | AgentEventTaskProfileResolved
  | AgentEventCandidateSetResolved
  | AgentEventRoutingDecisionMade
  | AgentEventRoutingFallbackApplied
  | AgentEventRoutingNotPossible
  | AgentEventLimitStateUpdated
  | AgentEventSingleCandidateOnly
  | AgentEventSingleCandidateCapabilityGap
  | AgentEventCostEstimated
  | AgentEventCostRecorded
  | AgentEventRateLimitHit
  | AgentEventQuotaLow
  | AgentEventQuotaBlocked
  | AgentEventQueueAdded
  | AgentEventQueueRemoved
  | AgentEventQueueStarted
  | AgentEventQueueCleared
  | AgentEventSubagentStatusChanged
  | AgentEventMessage
  | AgentEventWarning
  | AgentEventError
) &
  AgentEventEnvelope;

export interface AgentUserPreferences {
  providerConfig?: AsterProviderConfig;
  providerPreference?: string;
  modelPreference?: string;
  reasoningEffort?: string;
  thinking?: boolean;
  webSearch?: boolean;
  searchMode?: AgentRuntimeWebSearchMode;
  approvalPolicy?: AsterApprovalPolicy;
  sandboxPolicy?: AsterSandboxPolicy;
  executionStrategy?: AsterExecutionStrategy;
  autoContinue?: AutoContinueRequestPayload;
}

export interface AgentUserInputOp {
  type: "user_input";
  text: string;
  sessionId: string;
  eventName: string;
  workspaceId?: string;
  turnId?: string;
  images?: ImageInput[];
  preferences?: AgentUserPreferences;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
  queueIfBusy?: boolean;
  queuedTurnId?: string;
  skipPreSubmitResume?: boolean;
}

export interface AgentInterruptOp {
  type: "interrupt";
  sessionId: string;
  turnId?: string;
}

export interface AgentRetryOp {
  type: "retry";
  sessionId: string;
  turnId: string;
}

export interface AgentConfigUpdateOp {
  type: "config_update";
  sessionId: string;
  key: string;
  value: unknown;
}

export interface AgentShutdownOp {
  type: "shutdown";
  sessionId?: string;
}

export type AgentOp =
  | AgentUserInputOp
  | AgentInterruptOp
  | AgentRetryOp
  | AgentConfigUpdateOp
  | AgentShutdownOp;

function normalizeActionRequiredScope(
  value: unknown,
): AgentActionRequiredScope | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const scope = {
    session_id:
      typeof record.session_id === "string"
        ? record.session_id
        : typeof record.sessionId === "string"
          ? record.sessionId
          : undefined,
    thread_id:
      typeof record.thread_id === "string"
        ? record.thread_id
        : typeof record.threadId === "string"
          ? record.threadId
          : undefined,
    turn_id:
      typeof record.turn_id === "string"
        ? record.turn_id
        : typeof record.turnId === "string"
          ? record.turnId
          : undefined,
  };

  return scope.session_id || scope.thread_id || scope.turn_id
    ? scope
    : undefined;
}

function normalizeRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function pickStringField(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function normalizeToolArguments(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeToolResultOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeToolExecutionResult(
  event: Record<string, unknown>,
): AgentToolExecutionResult {
  const rawResult = normalizeRecord(event.result);
  const source = rawResult || event;
  const error = typeof source.error === "string" ? source.error : undefined;
  const status =
    typeof source.status === "string"
      ? source.status
      : typeof event.status === "string"
        ? event.status
        : undefined;
  const rawType = typeof event.type === "string" ? event.type : undefined;
  const success =
    typeof source.success === "boolean"
      ? source.success
      : rawType === "tool.failed" ||
          rawType === "tool_failed" ||
          status === "failed"
        ? false
        : !error;

  return {
    success,
    output: normalizeToolResultOutput(
      source.output ?? source.text ?? source.content,
    ),
    error,
    images: Array.isArray(source.images)
      ? (source.images as AgentToolResultImage[])
      : undefined,
    metadata: normalizeRecord(source.metadata),
  };
}

function withAgentEventEnvelope<TEvent extends AgentEvent>(
  source: Record<string, unknown>,
  event: TEvent,
): TEvent {
  return {
    ...event,
    event_id:
      typeof source.event_id === "string"
        ? source.event_id
        : typeof source.eventId === "string"
          ? source.eventId
          : event.event_id,
    sequence:
      typeof source.sequence === "number" && Number.isFinite(source.sequence)
        ? source.sequence
        : event.sequence,
    session_id:
      typeof source.session_id === "string"
        ? source.session_id
        : typeof source.sessionId === "string"
          ? source.sessionId
          : event.session_id,
    thread_id:
      typeof source.thread_id === "string"
        ? source.thread_id
        : typeof source.threadId === "string"
          ? source.threadId
          : event.thread_id,
    turn_id:
      typeof source.turn_id === "string"
        ? source.turn_id
        : typeof source.turnId === "string"
          ? source.turnId
          : event.turn_id,
    timestamp:
      typeof source.timestamp === "string" ? source.timestamp : event.timestamp,
  };
}

export function parseAgentEvent(data: unknown): AgentEvent | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const event = data as Record<string, unknown>;
  const type = event.type as string;

  const parsedEvent: AgentEvent | null = (() => {
    switch (type) {
    case "thread_started":
      return {
        type: "thread_started",
        thread_id: (event.thread_id as string) || "",
      };
    case "turn_started":
      return {
        type: "turn_started",
        turn: event.turn as AgentThreadTurn,
      };
    case "item_started":
      return {
        type: "item_started",
        item: normalizeLegacyThreadItem(event.item as AgentThreadItem),
      };
    case "item_updated":
      return {
        type: "item_updated",
        item: normalizeLegacyThreadItem(event.item as AgentThreadItem),
      };
    case "item_completed":
      return {
        type: "item_completed",
        item: normalizeLegacyThreadItem(event.item as AgentThreadItem),
      };
    case "turn_completed":
    case "turn.completed":
      return {
        type: "turn_completed",
        turn: event.turn as AgentThreadTurn,
        text: pickStringField(event, "text", "delta", "message", "content"),
        usage: event.usage as AgentTokenUsage | undefined,
      };
    case "turn_failed":
    case "turn.failed":
      return {
        type: "turn_failed",
        turn: event.turn as AgentThreadTurn,
      };
    case "turn_canceled":
    case "turn.canceled":
      return {
        type: "turn_canceled",
        turn: event.turn as AgentThreadTurn,
      };
    case "text_delta":
    case "message.delta":
      return {
        type: "text_delta",
        text: pickStringField(event, "text", "delta", "message", "content") || "",
      };
    case "text_delta_batch":
    case "message.delta_batch":
    case "message.batch": {
      const payload = normalizeRecord(event.payload);
      const text =
        pickStringField(event, "text", "delta", "message", "content") ||
        (payload
          ? pickStringField(payload, "text", "delta", "message", "content")
          : "") ||
        "";
      const chunks = Array.isArray(event.chunks)
        ? event.chunks.filter(
            (chunk): chunk is string => typeof chunk === "string",
          )
        : payload && Array.isArray(payload.chunks)
          ? payload.chunks.filter(
              (chunk): chunk is string => typeof chunk === "string",
            )
        : text
          ? [text]
          : [];
      return {
        type: "text_delta_batch",
        text,
        chunks,
        boundary:
          typeof event.boundary === "string"
            ? event.boundary
            : payload && typeof payload.boundary === "string"
              ? payload.boundary
              : "provider",
      };
    }
    case "reasoning_delta":
    case "thinking_delta":
      return {
        type: "thinking_delta",
        text: (event.text as string) || "",
      };
    case "tool_start":
    case "tool_started":
    case "tool.started":
      return {
        type: "tool_start",
        tool_name:
          pickStringField(event, "tool_name", "toolName", "name") || "",
        tool_id: pickStringField(event, "tool_id", "toolId", "id") || "",
        arguments: normalizeToolArguments(
          event.arguments ?? event.args ?? event.input ?? event.parameters,
        ),
      };
    case "tool_end":
    case "tool_result":
    case "tool.result":
    case "tool.failed":
    case "tool_failed":
      return {
        type: "tool_end",
        tool_id:
          pickStringField(event, "tool_id", "toolId", "toolCallId", "id") ||
          "",
        result: normalizeToolExecutionResult(event),
      };
    case "tool_progress": {
      const progress = normalizeRecord(event.progress) || {};
      return {
        type: "tool_progress",
        tool_id: (event.tool_id as string) || "",
        progress: {
          message:
            typeof progress.message === "string" ? progress.message : undefined,
          progress: normalizeOptionalNumber(progress.progress),
          total: normalizeOptionalNumber(progress.total),
          metadata: normalizeRecord(progress.metadata),
        },
      };
    }
    case "tool_output_delta":
      return {
        type: "tool_output_delta",
        tool_id: (event.tool_id as string) || "",
        delta: (event.delta as string) || "",
        output_kind:
          typeof event.output_kind === "string" ? event.output_kind : undefined,
        metadata: normalizeRecord(event.metadata),
      };
    case "tool_input_delta":
      return {
        type: "tool_input_delta",
        tool_id: (event.tool_id as string) || "",
        tool_name:
          typeof event.tool_name === "string" ? event.tool_name : undefined,
        delta: (event.delta as string) || "",
        accumulated_arguments:
          typeof event.accumulated_arguments === "string"
            ? event.accumulated_arguments
            : undefined,
        provider:
          typeof event.provider === "string" ? event.provider : undefined,
      };
    case "artifact_snapshot":
    case "ArtifactSnapshot": {
      const nestedArtifact =
        event.artifact && typeof event.artifact === "object"
          ? (event.artifact as Record<string, unknown>)
          : undefined;
      return {
        type: "artifact_snapshot",
        artifact: {
          artifactId: String(
            nestedArtifact?.artifactId ||
              nestedArtifact?.artifact_id ||
              event.artifact_id ||
              event.artifactId ||
              event.id ||
              "artifact-unknown",
          ),
          filePath:
            (nestedArtifact?.filePath as string | undefined) ||
            (nestedArtifact?.file_path as string | undefined) ||
            (event.file_path as string | undefined) ||
            (event.filePath as string | undefined),
          content:
            (nestedArtifact?.content as string | undefined) ||
            (event.content as string | undefined),
          metadata:
            (nestedArtifact?.metadata as Record<string, unknown> | undefined) ||
            (event.metadata as Record<string, unknown> | undefined),
        },
      };
    }
    case "action_required": {
      const actionData =
        (event.data as Record<string, unknown> | undefined) || {};
      const requestId =
        (event.request_id as string | undefined) ||
        (actionData.request_id as string | undefined) ||
        (actionData.id as string | undefined) ||
        "";
      const actionType =
        (event.action_type as string | undefined) ||
        (actionData.action_type as string | undefined) ||
        (actionData.type as string | undefined) ||
        "tool_confirmation";

      return {
        type: "action_required",
        request_id: requestId,
        action_type: actionType as AgentActionRequiredType,
        scope: normalizeActionRequiredScope(event.scope ?? actionData.scope),
        tool_name:
          (event.tool_name as string | undefined) ||
          (actionData.tool_name as string | undefined),
        arguments:
          (event.arguments as Record<string, unknown> | undefined) ||
          (actionData.arguments as Record<string, unknown> | undefined),
        prompt:
          (event.prompt as string | undefined) ||
          (actionData.prompt as string | undefined) ||
          (actionData.message as string | undefined),
        questions:
          (event.questions as AgentActionRequiredQuestion[] | undefined) ||
          (actionData.questions as AgentActionRequiredQuestion[] | undefined),
        requested_schema:
          (event.requested_schema as Record<string, unknown> | undefined) ||
          (actionData.requested_schema as Record<string, unknown> | undefined),
      };
    }
    case "action_resolved": {
      const actionData =
        (event.data as Record<string, unknown> | undefined) || {};
      const requestId =
        (event.request_id as string | undefined) ||
        (actionData.request_id as string | undefined) ||
        (actionData.requestId as string | undefined) ||
        (actionData.id as string | undefined) ||
        "";
      const actionType =
        (event.action_type as string | undefined) ||
        (actionData.action_type as string | undefined) ||
        (actionData.actionType as string | undefined) ||
        (actionData.type as string | undefined) ||
        "tool_confirmation";

      return {
        type: "action_resolved",
        request_id: requestId,
        action_type: actionType,
        scope: normalizeActionRequiredScope(event.scope ?? actionData.scope),
        approved:
          typeof event.approved === "boolean"
            ? event.approved
            : typeof actionData.approved === "boolean"
              ? actionData.approved
              : typeof actionData.approve === "boolean"
                ? actionData.approve
                : undefined,
        feedback:
          typeof event.feedback === "string"
            ? event.feedback
            : typeof actionData.feedback === "string"
              ? actionData.feedback
              : undefined,
        permission_mode:
          typeof event.permission_mode === "string"
            ? event.permission_mode
            : typeof actionData.permission_mode === "string"
              ? actionData.permission_mode
              : typeof actionData.permissionMode === "string"
                ? actionData.permissionMode
                : undefined,
        data: actionData,
      };
    }
    case "turn_context":
      return {
        type: "turn_context",
        session_id: (event.session_id as string) || "",
        thread_id: (event.thread_id as string) || "",
        turn_id: (event.turn_id as string) || "",
        execution_strategy: normalizeExecutionStrategyToReact(
          event.execution_strategy,
        ),
        output_schema_runtime:
          (event.output_schema_runtime as
            | AsterTurnOutputSchemaRuntime
            | null
            | undefined) || null,
        context_summary:
          (event.context_summary as
            | AgentTurnContextSummary
            | null
            | undefined) || null,
        approval_policy:
          typeof event.approval_policy === "string"
            ? event.approval_policy
            : null,
        sandbox_policy:
          typeof event.sandbox_policy === "string"
            ? event.sandbox_policy
            : null,
      };
    case "model_change":
      return {
        type: "model_change",
        model: (event.model as string) || "",
        mode: (event.mode as string) || "",
      };
    case "context_trace":
      return {
        type: "context_trace",
        steps: Array.isArray(event.steps)
          ? (event.steps as AgentContextTraceStep[])
          : [],
      };
    case "runtime_status": {
      const status =
        event.status && typeof event.status === "object"
          ? (event.status as Record<string, unknown>)
          : null;
      const metadata =
        status?.metadata && typeof status.metadata === "object"
          ? (status.metadata as Record<string, unknown>)
          : null;
      const phase = status?.phase;
      return {
        type: "runtime_status",
        status: {
          phase:
            phase === "preparing" ||
            phase === "routing" ||
            phase === "context" ||
            phase === "permission_review" ||
            phase === "retrying" ||
            phase === "continuing" ||
            phase === "synthesizing" ||
            phase === "failed"
              ? phase
              : "routing",
          title:
            typeof status?.title === "string"
              ? normalizeLegacyRuntimeStatusTitle(status.title)
              : "",
          detail: typeof status?.detail === "string" ? status.detail : "",
          checkpoints: Array.isArray(status?.checkpoints)
            ? (status?.checkpoints as string[])
            : undefined,
          metadata: metadata
            ? {
                ...metadata,
                team_phase:
                  typeof metadata.team_phase === "string"
                    ? metadata.team_phase
                    : undefined,
                team_parallel_budget:
                  typeof metadata.team_parallel_budget === "number"
                    ? metadata.team_parallel_budget
                    : undefined,
                team_active_count:
                  typeof metadata.team_active_count === "number"
                    ? metadata.team_active_count
                    : undefined,
                team_queued_count:
                  typeof metadata.team_queued_count === "number"
                    ? metadata.team_queued_count
                    : undefined,
                concurrency_phase:
                  typeof metadata.concurrency_phase === "string"
                    ? metadata.concurrency_phase
                    : undefined,
                concurrency_scope:
                  typeof metadata.concurrency_scope === "string"
                    ? metadata.concurrency_scope
                    : undefined,
                concurrency_active_count:
                  typeof metadata.concurrency_active_count === "number"
                    ? metadata.concurrency_active_count
                    : undefined,
                concurrency_queued_count:
                  typeof metadata.concurrency_queued_count === "number"
                    ? metadata.concurrency_queued_count
                    : undefined,
                concurrency_budget:
                  typeof metadata.concurrency_budget === "number"
                    ? metadata.concurrency_budget
                    : undefined,
                provider_concurrency_group:
                  typeof metadata.provider_concurrency_group === "string"
                    ? metadata.provider_concurrency_group
                    : undefined,
                provider_parallel_budget:
                  typeof metadata.provider_parallel_budget === "number"
                    ? metadata.provider_parallel_budget
                    : undefined,
                queue_reason:
                  typeof metadata.queue_reason === "string"
                    ? metadata.queue_reason
                    : undefined,
                retryable_overload:
                  typeof metadata.retryable_overload === "boolean"
                    ? metadata.retryable_overload
                    : undefined,
                permission_status:
                  typeof metadata.permission_status === "string"
                    ? metadata.permission_status
                    : undefined,
                required_profile_keys: Array.isArray(
                  metadata.required_profile_keys,
                )
                  ? (metadata.required_profile_keys as string[])
                  : undefined,
                ask_profile_keys: Array.isArray(metadata.ask_profile_keys)
                  ? (metadata.ask_profile_keys as string[])
                  : undefined,
                blocking_profile_keys: Array.isArray(
                  metadata.blocking_profile_keys,
                )
                  ? (metadata.blocking_profile_keys as string[])
                  : undefined,
                decision_source:
                  typeof metadata.decision_source === "string"
                    ? metadata.decision_source
                    : undefined,
                decision_scope:
                  typeof metadata.decision_scope === "string"
                    ? metadata.decision_scope
                    : undefined,
                confirmation_status:
                  typeof metadata.confirmation_status === "string"
                    ? metadata.confirmation_status
                    : undefined,
                confirmation_request_id:
                  typeof metadata.confirmation_request_id === "string"
                    ? metadata.confirmation_request_id
                    : undefined,
                confirmation_source:
                  typeof metadata.confirmation_source === "string"
                    ? metadata.confirmation_source
                    : undefined,
                declared_only:
                  typeof metadata.declared_only === "boolean"
                    ? metadata.declared_only
                    : undefined,
                turn_gating:
                  typeof metadata.turn_gating === "boolean"
                    ? metadata.turn_gating
                    : undefined,
                limit_status:
                  typeof metadata.limit_status === "string"
                    ? metadata.limit_status
                    : undefined,
                capability_gap:
                  typeof metadata.capability_gap === "string"
                    ? metadata.capability_gap
                    : undefined,
                keepalive_kind:
                  typeof metadata.keepalive_kind === "string"
                    ? metadata.keepalive_kind
                    : undefined,
                keepalive_sequence:
                  typeof metadata.keepalive_sequence === "number"
                    ? metadata.keepalive_sequence
                    : undefined,
                keepalive_elapsed_ms:
                  typeof metadata.keepalive_elapsed_ms === "number"
                    ? metadata.keepalive_elapsed_ms
                    : undefined,
              }
            : undefined,
        },
      };
    }
    case "task_profile_resolved":
      return {
        type: "task_profile_resolved",
        task_profile:
          (event.task_profile as AsterSessionExecutionRuntimeTaskProfile) ||
          (event.taskProfile as AsterSessionExecutionRuntimeTaskProfile),
      };
    case "candidate_set_resolved":
      return {
        type: "candidate_set_resolved",
        routing_decision: routingDecisionFromEvent(event),
      };
    case "routing_decision_made":
      return {
        type: "routing_decision_made",
        routing_decision: routingDecisionFromEvent(event),
      };
    case "routing_fallback_applied":
      return {
        type: "routing_fallback_applied",
        routing_decision: routingDecisionFromEvent(event),
      };
    case "routing_not_possible":
      return {
        type: "routing_not_possible",
        routing_decision: routingDecisionFromEvent(event),
      };
    case "limit_state_updated":
      return {
        type: "limit_state_updated",
        limit_state:
          (event.limit_state as AsterSessionExecutionRuntimeLimitState) ||
          (event.limitState as AsterSessionExecutionRuntimeLimitState),
      };
    case "single_candidate_only":
      return {
        type: "single_candidate_only",
        limit_state:
          (event.limit_state as AsterSessionExecutionRuntimeLimitState) ||
          (event.limitState as AsterSessionExecutionRuntimeLimitState),
      };
    case "single_candidate_capability_gap":
      return {
        type: "single_candidate_capability_gap",
        limit_state:
          (event.limit_state as AsterSessionExecutionRuntimeLimitState) ||
          (event.limitState as AsterSessionExecutionRuntimeLimitState),
      };
    case "cost_estimated":
      return {
        type: "cost_estimated",
        cost_state:
          (event.cost_state as AsterSessionExecutionRuntimeCostState) ||
          (event.costState as AsterSessionExecutionRuntimeCostState),
      };
    case "cost_recorded":
      return {
        type: "cost_recorded",
        cost_state:
          (event.cost_state as AsterSessionExecutionRuntimeCostState) ||
          (event.costState as AsterSessionExecutionRuntimeCostState),
      };
    case "rate_limit_hit":
      return {
        type: "rate_limit_hit",
        limit_event:
          (event.limit_event as AsterSessionExecutionRuntimeLimitEvent) ||
          (event.limitEvent as AsterSessionExecutionRuntimeLimitEvent),
      };
    case "quota_low":
      return {
        type: "quota_low",
        limit_event:
          (event.limit_event as AsterSessionExecutionRuntimeLimitEvent) ||
          (event.limitEvent as AsterSessionExecutionRuntimeLimitEvent),
      };
    case "quota_blocked":
      return {
        type: "quota_blocked",
        limit_event:
          (event.limit_event as AsterSessionExecutionRuntimeLimitEvent) ||
          (event.limitEvent as AsterSessionExecutionRuntimeLimitEvent),
      };
    case "queue_added": {
      const queuedTurn = normalizeQueuedTurnSnapshot(event.queued_turn);
      if (!queuedTurn) {
        return null;
      }
      return {
        type: "queue_added",
        session_id: (event.session_id as string) || "",
        queued_turn: queuedTurn,
      };
    }
    case "queue_removed":
      return {
        type: "queue_removed",
        session_id: (event.session_id as string) || "",
        queued_turn_id: (event.queued_turn_id as string) || "",
      };
    case "queue_started":
      return {
        type: "queue_started",
        session_id: (event.session_id as string) || "",
        queued_turn_id: (event.queued_turn_id as string) || "",
      };
    case "queue_cleared":
      return {
        type: "queue_cleared",
        session_id: (event.session_id as string) || "",
        queued_turn_ids: Array.isArray(event.queued_turn_ids)
          ? (event.queued_turn_ids as string[])
          : [],
      };
    case "subagent_status_changed":
      return {
        type: "subagent_status_changed",
        session_id: (event.session_id as string) || "",
        root_session_id: (event.root_session_id as string) || "",
        parent_session_id: event.parent_session_id as string | undefined,
        status:
          (event.status as AgentSubagentRuntimeStatus | undefined) || "idle",
        latest_turn_id:
          typeof event.latest_turn_id === "string"
            ? event.latest_turn_id
            : undefined,
        latest_turn_status: event.latest_turn_status as
          | AgentSubagentRuntimeStatus
          | undefined,
        queued_turn_count:
          typeof event.queued_turn_count === "number"
            ? event.queued_turn_count
            : undefined,
        team_phase:
          typeof event.team_phase === "string" ? event.team_phase : undefined,
        team_parallel_budget:
          typeof event.team_parallel_budget === "number"
            ? event.team_parallel_budget
            : undefined,
        team_active_count:
          typeof event.team_active_count === "number"
            ? event.team_active_count
            : undefined,
        team_queued_count:
          typeof event.team_queued_count === "number"
            ? event.team_queued_count
            : undefined,
        provider_concurrency_group:
          typeof event.provider_concurrency_group === "string"
            ? event.provider_concurrency_group
            : undefined,
        provider_parallel_budget:
          typeof event.provider_parallel_budget === "number"
            ? event.provider_parallel_budget
            : undefined,
        queue_reason:
          typeof event.queue_reason === "string"
            ? event.queue_reason
            : undefined,
        retryable_overload:
          typeof event.retryable_overload === "boolean"
            ? event.retryable_overload
            : undefined,
        closed: typeof event.closed === "boolean" ? event.closed : undefined,
        usage: event.usage as AgentTokenUsage | undefined,
        duration_ms: normalizeOptionalNumber(
          event.duration_ms ?? event.durationMs,
        ),
        tool_count: normalizeOptionalNumber(
          event.tool_count ?? event.toolCount,
        ),
        result_ref:
          typeof event.result_ref === "string"
            ? event.result_ref
            : typeof event.resultRef === "string"
              ? event.resultRef
              : undefined,
      };
    case "message":
      return {
        type: "message",
        message: event.message as AgentMessage,
      };
    case "error":
      return {
        type: "error",
        message: (event.message as string) || "Unknown error",
      };
    case "warning":
      return {
        type: "warning",
        code: event.code as string | undefined,
        message: (event.message as string) || "Unknown warning",
      };
    default:
      return null;
    }
  })();

  return parsedEvent ? withAgentEventEnvelope(event, parsedEvent) : null;
}

export function createSubmitTurnRequestFromAgentOp(
  op: AgentUserInputOp,
): AgentRuntimeSubmitTurnRequest {
  const preferences = op.preferences;

  return {
    message: op.text,
    session_id: op.sessionId,
    event_name: op.eventName,
    ...(op.workspaceId ? { workspace_id: op.workspaceId } : {}),
    turn_id: op.turnId,
    images: op.images,
    turn_config: {
      ...(preferences?.providerConfig
        ? { provider_config: preferences.providerConfig }
        : {}),
      provider_preference: preferences?.providerPreference,
      model_preference: preferences?.modelPreference,
      reasoning_effort: preferences?.reasoningEffort?.trim() || undefined,
      thinking_enabled: preferences?.thinking,
      approval_policy: preferences?.approvalPolicy,
      sandbox_policy: preferences?.sandboxPolicy,
      execution_strategy: preferences?.executionStrategy,
      web_search: preferences?.webSearch,
      ...(preferences?.searchMode
        ? { search_mode: preferences.searchMode }
        : {}),
      auto_continue: preferences?.autoContinue,
      system_prompt: op.systemPrompt,
      metadata: op.metadata,
    },
    queue_if_busy: op.queueIfBusy,
    queued_turn_id: op.queuedTurnId,
    skip_pre_submit_resume: op.skipPreSubmitResume,
  };
}
