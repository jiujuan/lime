import type { AgentRuntimeExecutionEvent } from "@limecloud/agent-ui-contracts";

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
}: RuntimeFactsSummaryProps<TEvent>) {
  const items = [
    { key: "sources", label: "输入源", value: readModel.sourceCount },
    { key: "actions", label: "待处理", value: readModel.pendingActions.length },
    { key: "artifacts", label: "产物", value: readModel.artifactRefs.length },
    { key: "evidence", label: "证据", value: readModel.evidenceRefs.length },
  ];
  if (!readModel.events.length) return null;
  return (
    <div className="agent-runtime-summary" aria-label="协作事实摘要">
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
  event,
  onResolveAction,
}: RuntimeFactCardProps<TEvent>) {
  return <RuntimeFactCard event={event} onResolveAction={onResolveAction} />;
}

export function EvidenceCard<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  event,
}: RuntimeFactCardProps<TEvent>) {
  return <RuntimeFactCard event={event} />;
}

export function ArtifactCard<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  event,
}: RuntimeFactCardProps<TEvent>) {
  return <RuntimeFactCard event={event} />;
}

export function RuntimeFactCard<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  event,
  onResolveAction,
}: RuntimeFactCardProps<TEvent>) {
  return (
    <article
      className={event.status}
      data-event-class={event.source.eventClass}
      data-owner={event.source.owner}
      data-phase={event.source.phase}
      data-surface={event.surface}
      data-action-kind={event.actionKind || undefined}
    >
      <span aria-hidden="true" />
      <div>
        <small className="agent-event-surface">{event.surface}</small>
        <strong>{event.title}</strong>
        {event.detail ? <small>{event.detail}</small> : null}
      </div>
      {event.action && onResolveAction ? (
        <button type="button" className="agent-event-action" onClick={() => onResolveAction(event.source, event.action!)}>
          {defaultActionButtonLabel(event.action)}
        </button>
      ) : (
        <em>{defaultEventStatusLabel(event)}</em>
      )}
    </article>
  );
}

export function RuntimeEventList<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  events,
  onResolveAction,
}: RuntimeEventListProps<TEvent>) {
  if (!events.length) return null;
  return (
    <div className="agent-execution-events" aria-label="执行事件">
      {events.map((event) => (
        <RuntimeFactCard key={event.id} event={event} onResolveAction={onResolveAction} />
      ))}
    </div>
  );
}

export function ToolGroup<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  tools = [],
  empty,
}: ToolGroupProps<TEvent>) {
  if (!tools.length) return empty === undefined ? null : <div className="agent-tool-group-empty">{empty}</div>;
  return (
    <div className="agent-tool-group" aria-label="工具调用">
      {tools.map((event) => (
        <RuntimeFactCard key={event.id} event={event} />
      ))}
    </div>
  );
}

export function ActionRequiredList<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  actions = [],
  empty,
  onResolveAction,
}: ActionRequiredListProps<TEvent>) {
  if (!actions.length) return empty === undefined ? null : <div className="agent-action-required-empty">{empty}</div>;
  return (
    <div className="agent-action-required-list" aria-label="待处理动作">
      {actions.map((event) => (
        <RuntimeFactCard key={event.id} event={event} onResolveAction={onResolveAction} />
      ))}
    </div>
  );
}

export function RuntimeFactsPanel<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  readModel,
  artifact,
  onResolveAction,
}: RuntimeFactsPanelProps<TEvent>) {
  return (
    <>
      <RuntimeFactsSummary readModel={readModel} />
      <RuntimeEventList events={readModel.visibleEvents} onResolveAction={onResolveAction} />
      {artifact ? <div className="agent-session-artifact">{artifact}</div> : null}
    </>
  );
}
