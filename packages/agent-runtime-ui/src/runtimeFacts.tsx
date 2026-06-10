import type { ReactNode } from "react";

import type {
  AgentRuntimeEventProjection,
  AgentRuntimeExecutionEvent,
} from "@limecloud/agent-ui-contracts";

import { defaultActionButtonLabel, defaultEventStatusLabel } from "./labels.js";
import type {
  ActionRequiredListProps,
  RuntimeEventListProps,
  RuntimeFactCardProps,
  RuntimeFactsPanelProps,
  RuntimeFactsSummaryProps,
  ToolGroupProps,
} from "./types.js";

export function RuntimeFactsSummary<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  readModel,
  ariaLabel = "Runtime facts summary",
  summaryLabels = {},
}: RuntimeFactsSummaryProps<TEvent>) {
  const items = [
    { key: "sources", label: summaryLabels.sources ?? "Input sources", value: readModel.sourceCount },
    { key: "actions", label: summaryLabels.actions ?? "Actions", value: readModel.pendingActions.length },
    { key: "artifacts", label: summaryLabels.artifacts ?? "Artifacts", value: readModel.artifactRefs.length },
    { key: "evidence", label: summaryLabels.evidence ?? "Evidence", value: readModel.evidenceRefs.length },
  ];
  if (!readModel.events.length) return null;
  return (
    <div className="agent-runtime-summary" aria-label={ariaLabel}>
      {items.map((item) => (
        <span key={item.key} data-summary-kind={item.key} className={item.value > 0 ? "ready" : "idle"}>
          <strong>{item.value}</strong>
          <em>{item.label}</em>
        </span>
      ))}
    </div>
  );
}

export function ActionCard<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  ...props
}: RuntimeFactCardProps<TEvent>) {
  return <RuntimeFactCard {...props} />;
}

export function EvidenceCard<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  ...props
}: RuntimeFactCardProps<TEvent>) {
  return <RuntimeFactCard {...props} />;
}

export function ArtifactCard<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  ...props
}: RuntimeFactCardProps<TEvent>) {
  return <RuntimeFactCard {...props} />;
}

export function RuntimeFactCard<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  event,
  onResolveAction,
  actionButtonLabel = defaultActionButtonLabel,
  eventStatusLabel = defaultEventStatusLabel as (
    event: AgentRuntimeEventProjection<TEvent>,
  ) => ReactNode,
}: RuntimeFactCardProps<TEvent>) {
  const actions = event.actions?.length
    ? event.actions
    : event.action
      ? [event.action]
      : [];
  return (
    <article
      className={event.status}
      data-event-id={event.id}
      data-event-class={event.source.eventClass}
      data-owner={event.source.owner}
      data-phase={event.source.phase}
      data-surface={event.surface}
      data-action-id={event.actionId || undefined}
      data-action-kind={event.actionKind || undefined}
      data-action-resolved={event.resolved ? "true" : undefined}
    >
      <span aria-hidden="true" />
      <div>
        <small className="agent-event-surface">{event.surface}</small>
        <strong>{event.title}</strong>
        {event.detail ? <small>{event.detail}</small> : null}
      </div>
      {actions.length && onResolveAction ? (
        <div className="agent-event-actions">
          {actions.map((action) => (
            <button
              key={`${event.id}:${action.decision}`}
              type="button"
              className="agent-event-action"
              data-action-decision={action.decision}
              onClick={() => onResolveAction(event.source, action)}
            >
              {actionButtonLabel(action)}
            </button>
          ))}
        </div>
      ) : (
        <em>{eventStatusLabel(event)}</em>
      )}
    </article>
  );
}

export function RuntimeEventList<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  events,
  onResolveAction,
  ariaLabel = "Execution events",
  actionButtonLabel,
  eventStatusLabel,
}: RuntimeEventListProps<TEvent>) {
  if (!events.length) return null;
  return (
    <div className="agent-execution-events" aria-label={ariaLabel}>
      {events.map((event) => (
        <RuntimeFactCard
          key={event.id}
          event={event}
          onResolveAction={onResolveAction}
          actionButtonLabel={actionButtonLabel}
          eventStatusLabel={eventStatusLabel}
        />
      ))}
    </div>
  );
}

export function ToolGroup<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  tools = [],
  empty,
  ariaLabel = "Tool calls",
  eventStatusLabel,
}: ToolGroupProps<TEvent>) {
  if (!tools.length) return empty === undefined ? null : <div className="agent-tool-group-empty">{empty}</div>;
  return (
    <div className="agent-tool-group" aria-label={ariaLabel}>
      {tools.map((event) => (
        <RuntimeFactCard key={event.id} event={event} eventStatusLabel={eventStatusLabel} />
      ))}
    </div>
  );
}

export function ActionRequiredList<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  actions = [],
  empty,
  onResolveAction,
  ariaLabel = "Action required",
  actionButtonLabel,
  eventStatusLabel,
}: ActionRequiredListProps<TEvent>) {
  if (!actions.length) return empty === undefined ? null : <div className="agent-action-required-empty">{empty}</div>;
  return (
    <div className="agent-action-required-list" aria-label={ariaLabel}>
      {actions.map((event) => (
        <RuntimeFactCard
          key={event.id}
          event={event}
          onResolveAction={onResolveAction}
          actionButtonLabel={actionButtonLabel}
          eventStatusLabel={eventStatusLabel}
        />
      ))}
    </div>
  );
}

export function RuntimeFactsPanel<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  readModel,
  artifact,
  onResolveAction,
  labels,
}: RuntimeFactsPanelProps<TEvent>) {
  return (
    <>
      <RuntimeFactsSummary
        readModel={readModel}
        ariaLabel={labels?.runtimeSummaryAriaLabel}
        summaryLabels={labels?.summaryLabels}
      />
      <RuntimeEventList
        events={readModel.visibleEvents}
        onResolveAction={onResolveAction}
        ariaLabel={labels?.executionEventsAriaLabel}
        actionButtonLabel={labels?.actionButtonLabel}
        eventStatusLabel={labels?.eventStatusLabel}
      />
      {artifact ? <div className="agent-session-artifact">{artifact}</div> : null}
    </>
  );
}
