import {
  buildAgentAppAgentUiProjectionEvents as buildInternalProjectionEvents,
} from "../../../src/features/agent-app/runtime/agentUiProjectionBridge";
import {
  buildAgentAppRunProjectionViewModel as buildInternalViewModel,
} from "../../../src/features/agent-app/runtime/agentUiProjectionViewModel";
import {
  buildAgentRunProjectionViewModelFromState as buildInternalViewModelFromState,
  collectAgentRunProjectionSourceEvents as collectInternalSourceEvents,
} from "../../../src/features/agent-app/runtime/agentRunProjectionState";

export type LimeAgentUiOwner =
  | "runtime"
  | "model"
  | "tool"
  | "action"
  | "artifact"
  | "evidence"
  | "context"
  | "policy"
  | "task"
  | "session"
  | "diagnostics"
  | "ui_projection"
  | "unknown"
  | "agent"
  | "team";

export type LimeAgentUiScope =
  | "application"
  | "workspace"
  | "session"
  | "thread"
  | "run"
  | "turn"
  | "message"
  | "part"
  | "task"
  | "agent"
  | "tool_call"
  | "action_request"
  | "artifact"
  | "evidence"
  | "unknown"
  | "team";

export type LimeAgentUiPhase =
  | "draft"
  | "submitted"
  | "accepted"
  | "routing"
  | "preparing"
  | "planning"
  | "reasoning"
  | "acting"
  | "waiting"
  | "producing"
  | "reconciling"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "archived"
  | "hydrating"
  | "unknown"
  | "reviewing";

export type LimeAgentUiSurface =
  | "composer"
  | "conversation"
  | "inline_process"
  | "runtime_status"
  | "tool_ui"
  | "hitl"
  | "task_capsule"
  | "artifact_workspace"
  | "timeline_evidence"
  | "session_tabs"
  | "diagnostics"
  | "custom"
  | "unknown"
  | "team_roster"
  | "work_board"
  | "delegation_graph"
  | "handoff_lane"
  | "worker_notifications"
  | "review_lane"
  | "teammate_transcript"
  | "background_teammate"
  | "remote_teammate"
  | "team_policy";

export type LimeAgentUiPersistence =
  | "ephemeral_live"
  | "transcript"
  | "snapshot"
  | "archive"
  | "artifact_store"
  | "evidence_pack"
  | "diagnostics_log"
  | "ui_local"
  | "unknown";

export type LimeAgentUiControl =
  | "send"
  | "queue"
  | "steer"
  | "interrupt"
  | "approve"
  | "reject"
  | "answer"
  | "edit"
  | "retry"
  | "rollback"
  | "remove"
  | "export"
  | "open_detail"
  | "none"
  | "unknown"
  | "delegate"
  | "assign"
  | "continue_agent"
  | "wait"
  | "stop"
  | "close"
  | "request_review";

export type LimeAgentUiEventClass =
  | "session.opened"
  | "session.hydrated"
  | "session.updated"
  | "session.closed"
  | "run.started"
  | "run.status"
  | "run.finished"
  | "run.failed"
  | "plan.delta"
  | "plan.final"
  | "text.delta"
  | "text.final"
  | "reasoning.delta"
  | "reasoning.summary"
  | "tool.started"
  | "tool.args"
  | "tool.args.delta"
  | "tool.progress"
  | "tool.output.delta"
  | "tool.result"
  | "tool.failed"
  | "action.required"
  | "action.resolved"
  | "queue.changed"
  | "task.changed"
  | "agent.changed"
  | "context.changed"
  | "context.compaction.started"
  | "context.compaction.completed"
  | "permission.changed"
  | "artifact.created"
  | "artifact.updated"
  | "artifact.preview.ready"
  | "artifact.version.created"
  | "artifact.diff.ready"
  | "artifact.export.started"
  | "artifact.export.completed"
  | "artifact.failed"
  | "artifact.deleted"
  | "artifact.changed"
  | "evidence.changed"
  | "state.snapshot"
  | "state.delta"
  | "messages.snapshot"
  | "diagnostic.changed"
  | "metric.changed"
  | "agent.spawned"
  | "agent.completed"
  | "agent.handoff"
  | "team.changed"
  | "worker.notification"
  | "review.requested"
  | "review.completed";

export type LimeAgentUiRuntimeStatus =
  | "idle"
  | "queued"
  | "submitted"
  | "accepted"
  | "preparing"
  | "running"
  | "waiting"
  | "needs_input"
  | "plan_ready"
  | "completed"
  | "failed"
  | "aborted"
  | "cancelled"
  | "closed"
  | "not_found"
  | "unknown";

export interface LimeAgentUiProjectionRefs {
  artifactIds?: string[];
  artifactPaths?: string[];
  contextSourceIds?: string[];
  teamMemoryKeys?: string[];
  diagnosticKeys?: string[];
  rawEventRef?: string;
}

export interface LimeAgentUiProjectionEvent {
  type: LimeAgentUiEventClass;
  sourceType: string;
  sequence?: number;
  timestamp?: string;
  sessionId?: string;
  threadId?: string;
  runId?: string;
  turnId?: string;
  messageId?: string;
  partId?: string;
  taskId?: string;
  toolCallId?: string;
  actionId?: string;
  artifactId?: string;
  evidenceId?: string;
  agentId?: string;
  diagnosticId?: string;
  owner: LimeAgentUiOwner;
  scope: LimeAgentUiScope;
  phase: LimeAgentUiPhase;
  surface?: LimeAgentUiSurface;
  persistence?: LimeAgentUiPersistence;
  control?: LimeAgentUiControl;
  parentSessionId?: string;
  parentThreadId?: string;
  agentName?: string;
  teamName?: string;
  teamId?: string;
  agentRole?: string;
  agentSource?: string;
  workerNotificationId?: string;
  remoteTaskId?: string;
  transcriptRef?: string;
  topology?: string;
  runtimeEntity?: string;
  runtimeStatus?: LimeAgentUiRuntimeStatus;
  latestTurnStatus?: LimeAgentUiRuntimeStatus;
  teamPhase?: string;
  teamParallelBudget?: number;
  teamActiveCount?: number;
  teamQueuedCount?: number;
  queuedTurnCount?: number;
  queueReason?: string;
  providerConcurrencyGroup?: string;
  providerParallelBudget?: number;
  retryableOverload?: boolean;
  workItemId?: string;
  reviewId?: string;
  handoffId?: string;
  workerUsage?: Record<string, unknown> | null;
  teamPolicy?: Record<string, unknown> | null;
  payload?: Record<string, unknown>;
  refs?: LimeAgentUiProjectionRefs;
  rawEventRef?: string;
}

export interface LimeAgentUiProjectionBuildOptions {
  appId?: string | null;
  taskId?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  turnId?: string | null;
  timestamp?: string | null;
  startSequence?: number;
  events?: unknown[];
}

export interface LimeAgentRunProjectionStateOptions {
  startSequence?: number;
}

export type LimeAgentRunProjectionPartKind =
  | "status"
  | "queue"
  | "text"
  | "reasoning"
  | "tool"
  | "action"
  | "artifact"
  | "evidence"
  | "diagnostic";

export type LimeAgentRunProjectionLabel =
  | "status"
  | "queue"
  | "answer"
  | "reasoning"
  | "tool"
  | "actionRequired"
  | "actionResolved"
  | "artifact"
  | "evidence"
  | "diagnostic";

export type LimeAgentRunProjectionActionControl = Exclude<
  LimeAgentUiControl,
  "none"
>;

export interface LimeAgentRunProjectionPart {
  id: string;
  kind: LimeAgentRunProjectionPartKind;
  type: LimeAgentUiEventClass;
  sequence: number;
  label: LimeAgentRunProjectionLabel;
  displayName?: string;
  preview?: string;
  runtimeStatus?: LimeAgentUiRuntimeStatus;
  surface?: LimeAgentUiSurface;
  collapsedByDefault: boolean;
  toolCallId?: string;
  actionId?: string;
  artifactId?: string;
  evidenceId?: string;
}

export interface LimeAgentRunProjectionAction {
  actionId: string;
  sessionId?: string;
  threadId?: string;
  runId?: string;
  turnId?: string;
  taskId?: string;
  actionType?: string;
  status: "pending" | "resolved";
  label: "actionRequired" | "actionResolved";
  control?: LimeAgentRunProjectionActionControl;
  controls: LimeAgentRunProjectionActionControl[];
  preview?: string;
}

export interface LimeAgentRunProjectionArtifact {
  artifactId: string;
  label: "artifact";
  preview?: string;
  ref?: string;
  status?: LimeAgentUiRuntimeStatus;
}

export interface LimeAgentRunProjectionEvidence {
  evidenceId: string;
  label: "evidence";
  preview?: string;
  status?: LimeAgentUiRuntimeStatus;
}

export interface LimeAgentRunProjectionDiagnostic {
  diagnosticId: string;
  label: "diagnostic";
  preview?: string;
  status?: LimeAgentUiRuntimeStatus;
}

export interface LimeAgentRunProjectionTaskSummary {
  latestRuntimeStatus: LimeAgentUiRuntimeStatus | "unknown";
  terminal: boolean;
  collapsedByDefault: boolean;
  pendingActionCount: number;
  toolCallCount: number;
  artifactCount: number;
  evidenceCount: number;
  queueCount: number;
}

export interface LimeAgentRunProjectionMetrics {
  providerName?: string;
  modelName?: string;
  modelLabel?: string;
  tokenCount?: number;
  tokenText?: string;
  costText?: string;
}

export interface LimeAgentRunProjectionViewModel {
  orderedParts: LimeAgentRunProjectionPart[];
  actions: LimeAgentRunProjectionAction[];
  artifacts: LimeAgentRunProjectionArtifact[];
  evidence: LimeAgentRunProjectionEvidence[];
  diagnostics: LimeAgentRunProjectionDiagnostic[];
  task: LimeAgentRunProjectionTaskSummary;
  metrics: LimeAgentRunProjectionMetrics;
  answerText: string;
  reasoningText: string;
}

export function buildLimeAgentUiProjectionEvents(
  options: LimeAgentUiProjectionBuildOptions = {},
): LimeAgentUiProjectionEvent[] {
  return buildInternalProjectionEvents(options) as LimeAgentUiProjectionEvent[];
}

export function buildLimeAgentRunProjectionViewModel(
  events: LimeAgentUiProjectionEvent[],
): LimeAgentRunProjectionViewModel {
  return buildInternalViewModel(events as never) as LimeAgentRunProjectionViewModel;
}

export function buildLimeAgentRunProjectionViewModelFromState(
  state: unknown,
  options: LimeAgentRunProjectionStateOptions = {},
): LimeAgentRunProjectionViewModel {
  return buildInternalViewModelFromState(
    state,
    options,
  ) as LimeAgentRunProjectionViewModel;
}

export function collectLimeAgentRunProjectionSourceEvents(state: unknown): unknown[] {
  return collectInternalSourceEvents(state);
}

export const buildAgentAppAgentUiProjectionEvents = buildLimeAgentUiProjectionEvents;
export const buildAgentAppRunProjectionViewModel = buildLimeAgentRunProjectionViewModel;
export const buildAgentRunProjectionViewModelFromState = buildLimeAgentRunProjectionViewModelFromState;
export const collectAgentRunProjectionSourceEvents = collectLimeAgentRunProjectionSourceEvents;

export interface LimeAgentRunProjectionSummaryLabels {
  status: string;
  model: string;
  tokens: string;
  cost: string;
  pendingActions: string;
  tools: string;
  artifacts: string;
  evidence: string;
  queue: string;
}

export interface LimeAgentRunProjectionRenderLabels {
  parts?: Partial<Record<LimeAgentRunProjectionLabel, string>>;
  summary?: Partial<LimeAgentRunProjectionSummaryLabels>;
  empty?: string;
}

interface ResolvedLimeAgentRunProjectionRenderLabels {
  parts: Record<LimeAgentRunProjectionLabel, string>;
  summary: LimeAgentRunProjectionSummaryLabels;
  empty: string;
}

export interface LimeAgentRunProjectionRenderOptions {
  labels?: LimeAgentRunProjectionRenderLabels;
  className?: string;
  includeStyles?: boolean;
  styleNonce?: string;
}

export interface LimeAgentRunProjectionStateRenderOptions
  extends LimeAgentRunProjectionRenderOptions {
  startSequence?: number;
}

export const LIME_AGENT_RUN_PROJECTION_DEFAULT_CSS = `
[data-lime-agent-run-projection] {
  --lime-agent-run-bg: #f8fafc;
  --lime-agent-run-card: #ffffff;
  --lime-agent-run-border: #d8dee8;
  --lime-agent-run-muted: #667085;
  --lime-agent-run-text: #172033;
  --lime-agent-run-accent: #2364aa;
  display: grid;
  gap: 0.75rem;
  color: var(--lime-agent-run-text);
}
[data-lime-agent-run-projection-summary] {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  gap: 0.5rem;
}
[data-lime-agent-run-projection-summary-item],
[data-lime-agent-run-projection-part],
[data-lime-agent-run-projection-action],
[data-lime-agent-run-projection-artifacts] article,
[data-lime-agent-run-projection-evidence] article,
[data-lime-agent-run-projection-diagnostics] article {
  border: 1px solid var(--lime-agent-run-border);
  border-radius: 0.875rem;
  background: var(--lime-agent-run-card);
}
[data-lime-agent-run-projection-summary-item] {
  display: grid;
  gap: 0.125rem;
  padding: 0.625rem 0.75rem;
}
[data-lime-agent-run-projection-summary-item] strong,
[data-lime-agent-run-projection-part] summary {
  font-weight: 650;
}
[data-lime-agent-run-projection-summary-item] em,
[data-lime-agent-run-projection-part-status] {
  color: var(--lime-agent-run-muted);
  font-style: normal;
}
[data-lime-agent-run-projection-part] summary {
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
}
[data-lime-agent-run-projection-part-preview] {
  border-top: 1px solid var(--lime-agent-run-border);
  padding: 0.625rem 0.75rem;
  line-height: 1.6;
  white-space: pre-wrap;
}
[data-lime-agent-run-projection-actions],
[data-lime-agent-run-projection-artifacts],
[data-lime-agent-run-projection-evidence],
[data-lime-agent-run-projection-diagnostics] {
  display: grid;
  gap: 0.5rem;
}
[data-lime-agent-run-projection-action],
[data-lime-agent-run-projection-artifacts] article,
[data-lime-agent-run-projection-evidence] article,
[data-lime-agent-run-projection-diagnostics] article {
  padding: 0.625rem 0.75rem;
}
[data-lime-agent-run-projection-empty] {
  border: 1px dashed var(--lime-agent-run-border);
  border-radius: 0.875rem;
  padding: 0.875rem;
  color: var(--lime-agent-run-muted);
  background: var(--lime-agent-run-bg);
}
`.trim();

const DEFAULT_RENDER_LABELS: ResolvedLimeAgentRunProjectionRenderLabels = {
  parts: {
    status: "Status",
    queue: "Queue",
    answer: "Answer",
    reasoning: "Thinking",
    tool: "Tool",
    actionRequired: "Action required",
    actionResolved: "Action resolved",
    artifact: "Artifact",
    evidence: "Evidence",
    diagnostic: "Diagnostic",
  },
  summary: {
    status: "Status",
    model: "Model",
    tokens: "Tokens",
    cost: "Cost",
    pendingActions: "Actions",
    tools: "Tools",
    artifacts: "Artifacts",
    evidence: "Evidence",
    queue: "Queue",
  },
  empty: "No AgentRuntime process yet.",
};

export function renderLimeAgentRunProjectionStateHtml(
  state: unknown,
  options: LimeAgentRunProjectionStateRenderOptions = {},
): string {
  const { startSequence, ...renderOptions } = options;
  return renderLimeAgentRunProjectionHtml(
    buildLimeAgentRunProjectionViewModelFromState(state, { startSequence }),
    renderOptions,
  );
}

export function renderLimeAgentRunProjectionHtml(
  view: LimeAgentRunProjectionViewModel,
  options: LimeAgentRunProjectionRenderOptions = {},
): string {
  const labels = mergeRenderLabels(options.labels);
  const className = options.className ?? "lime-agent-run-projection";
  const partsHtml = view.orderedParts.length > 0
    ? view.orderedParts.map((part) => renderProjectionPart(part, labels)).join("")
    : `<p data-lime-agent-run-projection-empty>${escapeHtml(labels.empty)}</p>`;
  const styleHtml = options.includeStyles
    ? renderLimeAgentRunProjectionStyleTag(options.styleNonce)
    : "";

  return [
    styleHtml,
    `<section class="${escapeAttribute(className)}" data-lime-agent-run-projection data-terminal="${view.task.terminal ? "true" : "false"}">`,
    renderProjectionSummary(view, labels),
    `<div data-lime-agent-run-projection-parts>${partsHtml}</div>`,
    renderProjectionActions(view, labels),
    renderProjectionRefs("artifacts", view.artifacts, labels.summary.artifacts),
    renderProjectionRefs("evidence", view.evidence, labels.summary.evidence),
    renderProjectionRefs("diagnostics", view.diagnostics, labels.parts.diagnostic),
    `</section>`,
  ].join("");
}

export function renderLimeAgentRunProjectionStyleTag(nonce?: string): string {
  const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : "";
  return `<style data-lime-agent-run-projection-style${nonceAttribute}>${LIME_AGENT_RUN_PROJECTION_DEFAULT_CSS}</style>`;
}

function mergeRenderLabels(
  labels: LimeAgentRunProjectionRenderLabels = {},
): ResolvedLimeAgentRunProjectionRenderLabels {
  return {
    parts: { ...DEFAULT_RENDER_LABELS.parts, ...(labels.parts ?? {}) },
    summary: { ...DEFAULT_RENDER_LABELS.summary, ...(labels.summary ?? {}) },
    empty: labels.empty ?? DEFAULT_RENDER_LABELS.empty,
  };
}

function renderProjectionSummary(
  view: LimeAgentRunProjectionViewModel,
  labels: ResolvedLimeAgentRunProjectionRenderLabels,
): string {
  const metrics = view.metrics ?? {};
  const cards = [
    [labels.summary.status, view.task.latestRuntimeStatus],
    metrics.modelLabel ? [labels.summary.model, metrics.modelLabel] : null,
    metrics.tokenText ? [labels.summary.tokens, metrics.tokenText] : null,
    metrics.costText ? [labels.summary.cost, metrics.costText] : null,
    [labels.summary.pendingActions, view.task.pendingActionCount],
    [labels.summary.tools, view.task.toolCallCount],
    [labels.summary.artifacts, view.task.artifactCount],
    [labels.summary.evidence, view.task.evidenceCount],
    [labels.summary.queue, view.task.queueCount],
  ].filter((card): card is [string, string | number] => Boolean(card));
  return `<div data-lime-agent-run-projection-summary>${cards
    .map(
      ([label, value]) =>
        `<span data-lime-agent-run-projection-summary-item><strong>${escapeHtml(String(label))}</strong><em>${escapeHtml(String(value))}</em></span>`,
    )
    .join("")}</div>`;
}

function renderProjectionPart(
  part: LimeAgentRunProjectionPart,
  labels: ResolvedLimeAgentRunProjectionRenderLabels,
): string {
  const title = part.displayName ?? labels.parts[part.label];
  const open = part.collapsedByDefault ? "" : " open";
  const status = part.runtimeStatus
    ? `<span data-lime-agent-run-projection-part-status>${escapeHtml(part.runtimeStatus)}</span>`
    : "";
  const preview = part.preview
    ? `<div data-lime-agent-run-projection-part-preview>${escapeHtml(part.preview)}</div>`
    : "";
  return [
    `<details data-lime-agent-run-projection-part data-kind="${escapeAttribute(part.kind)}" data-type="${escapeAttribute(part.type)}"${open}>`,
    `<summary><span>${escapeHtml(title)}</span>${status}</summary>`,
    preview,
    `</details>`,
  ].join("");
}

function renderProjectionActions(
  view: LimeAgentRunProjectionViewModel,
  labels: ResolvedLimeAgentRunProjectionRenderLabels,
): string {
  if (view.actions.length === 0) return "";
  return `<div data-lime-agent-run-projection-actions>${view.actions
    .map(
      (action) =>
        `<article data-lime-agent-run-projection-action data-status="${escapeAttribute(action.status)}"><strong>${escapeHtml(labels.parts[action.label])}</strong>${action.preview ? `<p>${escapeHtml(action.preview)}</p>` : ""}</article>`,
    )
    .join("")}</div>`;
}

function renderProjectionRefs(
  kind: string,
  items: Array<{ preview?: string; status?: LimeAgentUiRuntimeStatus }>,
  label: string,
): string {
  if (items.length === 0) return "";
  return `<div data-lime-agent-run-projection-${escapeAttribute(kind)}><strong>${escapeHtml(label)}</strong>${items
    .map(
      (item) =>
        `<article>${item.preview ? `<span>${escapeHtml(item.preview)}</span>` : ""}${item.status ? `<em>${escapeHtml(item.status)}</em>` : ""}</article>`,
    )
    .join("")}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

export interface LimeAgentRunProjectionMountTarget {
  innerHTML: string;
}

export function mountLimeAgentRunProjectionHtml(
  target: LimeAgentRunProjectionMountTarget,
  view: LimeAgentRunProjectionViewModel,
  options: LimeAgentRunProjectionRenderOptions = {},
): string {
  const html = renderLimeAgentRunProjectionHtml(view, options);
  target.innerHTML = html;
  return html;
}

export function mountLimeAgentRunProjectionState(
  target: LimeAgentRunProjectionMountTarget,
  state: unknown,
  options: LimeAgentRunProjectionStateRenderOptions = {},
): string {
  const html = renderLimeAgentRunProjectionStateHtml(state, options);
  target.innerHTML = html;
  return html;
}
