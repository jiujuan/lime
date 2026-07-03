import type {
  AgentRuntimeActionProjection,
  AgentRuntimeExecutionEvent,
  AgentUiProjectionState,
} from "@limecloud/agent-ui-contracts";
import { AgentUiProjectionView } from "@limecloud/agent-runtime-ui";

import type {
  PluginRunProjectionAction,
  PluginRunProjectionActionControl,
  PluginRunProjectionLabel,
  PluginRunProjectionViewModel,
} from "../runtime/agentUiProjectionViewModel";

export interface AgentRunProjectionPanelLabels {
  parts: Record<PluginRunProjectionLabel, string>;
  actionControls?: Partial<Record<PluginRunProjectionActionControl, string>>;
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
  view: PluginRunProjectionViewModel;
  standardState: AgentUiProjectionState;
  labels: AgentRunProjectionPanelLabels;
  className?: string;
  onAction?: (
    action: PluginRunProjectionAction,
    control: PluginRunProjectionActionControl,
  ) => void;
}

export function AgentRunProjectionPanel({
  view,
  standardState,
  labels,
  className = "space-y-3",
  onAction,
}: AgentRunProjectionPanelProps) {
  const resolveStandardAction = onAction
    ? standardAgentActionResolver(onAction)
    : undefined;

  return (
    <section
      className={className}
      data-testid="agent-run-projection-panel"
      data-agent-run-projection-terminal={view.task.terminal ? "true" : "false"}
      data-agent-run-standard-projection="true"
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

      <div
        className="space-y-2"
        data-testid="agent-run-standard-projection"
        data-agent-run-standard-runtime-status={standardState.runtime.status}
      >
        <AgentUiProjectionView
          state={standardState}
          emptyMessages={
            <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
              {labels.empty}
            </p>
          }
          labels={{
            messagePartsAriaLabel: labels.parts.answer,
            processTimelineAriaLabel: labels.parts.status,
            executionGraphAriaLabel: labels.summary.tools,
            runtimeSummaryAriaLabel: labels.summary.status,
            executionEventsAriaLabel: labels.parts.status,
            toolGroupAriaLabel: labels.parts.tool,
            actionRequiredAriaLabel: labels.parts.actionRequired,
            summaryLabels: {
              sources: labels.parts.answer,
              actions: labels.summary.pendingActions,
              artifacts: labels.summary.artifacts,
              evidence: labels.summary.evidence,
            },
            roleLabel: roleShortLabel,
            messagePartTitle: (part) =>
              part.role === "user"
                ? "用户"
                : part.role === "assistant"
                  ? "助手"
                  : labels.parts[partLabel(part.type)],
            actionButtonLabel: (action) =>
              labels.actionControls?.[
                actionControlFromDecision(action.decision) ?? "approve"
              ] ?? "处理",
            eventStatusLabel: (event) =>
              event.displayStatus ?? event.displayStatusKey,
          }}
          onResolveAction={resolveStandardAction}
        />
      </div>
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
): PluginRunProjectionAction | null {
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
): PluginRunProjectionActionControl[] {
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
    .filter((item): item is PluginRunProjectionActionControl => Boolean(item));
  return normalized.length ? [...new Set(normalized)] : ["approve"];
}

function actionControlFromDecision(value: unknown): PluginRunProjectionActionControl | undefined {
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

function roleShortLabel(role: string): string {
  if (role === "user") return "用";
  if (role === "assistant") return "助";
  if (role === "system") return "系";
  return "讯";
}

function partLabel(type: string): PluginRunProjectionLabel {
  if (type === "reasoning") return "reasoning";
  if (type === "tool-preview") return "tool";
  if (type === "artifact-card") return "artifact";
  if (type === "evidence-citation") return "evidence";
  if (type === "diagnostic-ref") return "diagnostic";
  return "answer";
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
