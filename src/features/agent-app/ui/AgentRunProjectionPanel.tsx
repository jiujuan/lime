import type {
  AgentRuntimeActionProjection,
  AgentRuntimeExecutionEvent,
  AgentUiProjectionState,
} from "@limecloud/agent-ui-contracts";
import { AgentUiProjectionView } from "@limecloud/agent-runtime-ui";

import type {
  AgentAppRunProjectionAction,
  AgentAppRunProjectionActionControl,
  AgentAppRunProjectionLabel,
  AgentAppRunProjectionViewModel,
} from "../runtime/agentUiProjectionViewModel";

export interface AgentRunProjectionPanelLabels {
  parts: Record<AgentAppRunProjectionLabel, string>;
  actionControls?: Partial<Record<AgentAppRunProjectionActionControl, string>>;
  summary: {
    status: string;
    pendingActions: string;
    tools: string;
    artifacts: string;
    evidence: string;
    queue: string;
  };
  empty: string;
}

export interface AgentRunProjectionPanelProps {
  view: AgentAppRunProjectionViewModel;
  standardState?: AgentUiProjectionState;
  labels: AgentRunProjectionPanelLabels;
  className?: string;
  onAction?: (
    action: AgentAppRunProjectionAction,
    control: AgentAppRunProjectionActionControl,
  ) => void;
}

export function AgentRunProjectionPanel({
  view,
  standardState,
  labels,
  className = "space-y-3",
  onAction,
}: AgentRunProjectionPanelProps) {
  const hasStandardState = Boolean(standardState);
  const resolveStandardAction = onAction
    ? standardAgentActionResolver(onAction)
    : undefined;

  return (
    <section
      className={className}
      data-testid="agent-run-projection-panel"
      data-agent-run-projection-terminal={view.task.terminal ? "true" : "false"}
      data-agent-run-standard-projection={hasStandardState ? "true" : "false"}
    >
      <div
        className="grid grid-cols-2 gap-2"
        data-testid="agent-run-projection-summary"
      >
        <SummaryCard
          label={labels.summary.status}
          value={view.task.latestRuntimeStatus}
        />
        <SummaryCard
          label={labels.summary.pendingActions}
          value={String(view.task.pendingActionCount)}
        />
        <SummaryCard
          label={labels.summary.tools}
          value={String(view.task.toolCallCount)}
        />
        <SummaryCard
          label={labels.summary.artifacts}
          value={String(view.task.artifactCount)}
        />
        <SummaryCard
          label={labels.summary.evidence}
          value={String(view.task.evidenceCount)}
        />
        <SummaryCard
          label={labels.summary.queue}
          value={String(view.task.queueCount)}
        />
      </div>

      {standardState ? (
        <div
          className="space-y-2"
          data-testid="agent-run-standard-projection"
          data-agent-run-standard-runtime-status={standardState.runtime.status}
        >
          <AgentUiProjectionView
            state={standardState}
            emptyMessages={null}
            onResolveAction={resolveStandardAction}
          />
        </div>
      ) : null}

      <div className="space-y-2" data-testid="agent-run-projection-parts">
        {view.orderedParts.length > 0 ? (
          view.orderedParts.map((part) => (
            <details
              key={part.id}
              className="rounded-2xl border border-slate-200 bg-white"
              open={!part.collapsedByDefault}
              data-agent-run-projection-part-kind={part.kind}
              data-agent-run-projection-event-type={part.type}
            >
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">
                <span>{part.displayName ?? labels.parts[part.label]}</span>
                {part.runtimeStatus ? (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {part.runtimeStatus}
                  </span>
                ) : null}
              </summary>
              {part.preview ? (
                <div className="border-t border-slate-100 px-3 py-2 text-sm leading-6 text-slate-700">
                  {part.preview}
                </div>
              ) : null}
            </details>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
            {labels.empty}
          </p>
        )}
      </div>

      {view.actions.length > 0 ? (
        <div className="space-y-2" data-testid="agent-run-projection-actions">
          {view.actions.map((action) => (
            <article
              key={action.actionId}
              className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2"
              data-agent-run-projection-action-id={action.actionId}
              data-agent-run-projection-action-task-id={action.taskId}
              data-agent-run-projection-action-session-id={action.sessionId}
              data-agent-run-projection-action-run-id={action.runId}
              data-agent-run-projection-action-status={action.status}
              data-agent-run-projection-action-control={action.control}
            >
              <p className="text-sm font-semibold text-amber-900">
                {labels.parts[action.label]}
              </p>
              {action.preview ? (
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  {action.preview}
                </p>
              ) : null}
              {onAction &&
              action.status === "pending" &&
              action.controls.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {action.controls.map((control) => (
                    <button
                      key={control}
                      type="button"
                      className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900"
                      data-agent-run-projection-action-control-button={control}
                      onClick={() => onAction(action, control)}
                    >
                      {labels.actionControls?.[control] ??
                        labels.parts[action.label]}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {view.artifacts.length > 0 ? (
        <div className="space-y-2" data-testid="agent-run-projection-artifacts">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {labels.summary.artifacts}
          </p>
          {view.artifacts.map((artifact) => (
            <article
              key={artifact.artifactId}
              className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2"
              data-agent-run-projection-artifact-id={artifact.artifactId}
            >
              <p className="text-sm font-semibold text-blue-950">
                {artifact.preview || labels.parts.artifact}
              </p>
              {artifact.ref ? (
                <p className="mt-1 truncate text-xs text-blue-800">
                  {artifact.ref}
                </p>
              ) : null}
              {artifact.status ? (
                <p className="mt-1 text-xs text-blue-700">{artifact.status}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {view.evidence.length > 0 ? (
        <div className="space-y-2" data-testid="agent-run-projection-evidence">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {labels.summary.evidence}
          </p>
          {view.evidence.map((evidence) => (
            <article
              key={evidence.evidenceId}
              className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2"
              data-agent-run-projection-evidence-id={evidence.evidenceId}
            >
              <p className="text-sm font-semibold text-emerald-950">
                {evidence.preview || labels.parts.evidence}
              </p>
              {evidence.status ? (
                <p className="mt-1 text-xs text-emerald-700">
                  {evidence.status}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {view.diagnostics.length > 0 ? (
        <div
          className="space-y-2"
          data-testid="agent-run-projection-diagnostics"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {labels.parts.diagnostic}
          </p>
          {view.diagnostics.map((diagnostic) => (
            <article
              key={diagnostic.diagnosticId}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
              data-agent-run-projection-diagnostic-id={
                diagnostic.diagnosticId
              }
            >
              <p className="text-sm font-semibold text-slate-950">
                {diagnostic.preview || labels.parts.diagnostic}
              </p>
              {diagnostic.status ? (
                <p className="mt-1 text-xs text-slate-600">
                  {diagnostic.status}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function standardAgentActionResolver(
  onAction: NonNullable<AgentRunProjectionPanelProps["onAction"]>,
) {
  return (
    event: AgentRuntimeExecutionEvent,
    action: AgentRuntimeActionProjection,
  ) => {
    const projectionAction = actionFromStandardRuntimeEvent(event, action);
    if (!projectionAction) {
      return;
    }
    const control =
      actionControlFromDecision(action.decision) ??
      projectionAction.controls[0];
    if (!control) {
      return;
    }
    onAction(projectionAction, control);
  };
}

function actionFromStandardRuntimeEvent(
  event: AgentRuntimeExecutionEvent,
  action: AgentRuntimeActionProjection,
): AgentAppRunProjectionAction | null {
  const actionId = event.actionId ?? stringValue(event.payload?.actionId);
  if (!actionId) {
    return null;
  }
  const resolved = event.eventClass === "action.resolved";
  const controls = readActionControls(event.payload, action);
  return {
    actionId,
    sessionId: event.runtimeId ?? event.threadId,
    threadId: event.threadId,
    runId: event.runId,
    turnId: event.turnId,
    taskId: event.taskId,
    actionType: stringValue(event.payload?.actionType),
    status: resolved ? "resolved" : "pending",
    label: resolved ? "actionResolved" : "actionRequired",
    control: controls[0],
    controls,
    preview: event.detail ?? stringValue(event.payload?.preview) ?? event.title,
  };
}

function readActionControls(
  payload: Record<string, unknown> | undefined,
  action: AgentRuntimeActionProjection,
): AgentAppRunProjectionActionControl[] {
  const controls = payload?.controls;
  const payloadControls = Array.isArray(controls) ? controls : [];
  const candidates = [
    action.decision,
    stringValue(payload?.control),
    stringValue(payload?.decision),
    ...payloadControls,
  ];
  const normalized = candidates
    .map((item) => actionControlFromDecision(item))
    .filter((item): item is AgentAppRunProjectionActionControl => Boolean(item));
  return normalized.length ? [...new Set(normalized)] : ["approve"];
}

function actionControlFromDecision(value: unknown): AgentAppRunProjectionActionControl | undefined {
  if (
    value === "approve" ||
    value === "approved" ||
    value === "confirmed" ||
    value === "acknowledge"
  ) {
    return "approve";
  }
  if (value === "reject" || value === "rejected" || value === "denied") {
    return "reject";
  }
  if (value === "answer" || value === "respond") {
    return "answer";
  }
  if (value === "edit") {
    return "edit";
  }
  if (value === "retry") {
    return "retry";
  }
  if (value === "interrupt") {
    return "interrupt";
  }
  if (value === "stop") {
    return "stop";
  }
  return typeof value === "string" && value.trim() && value !== "none"
    ? value
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}
