import type { ReactNode } from "react";

import type {
  AgentRuntimeActionProjection,
  AgentRuntimeEventProjection,
  AgentRuntimeReadModel,
  AgentRuntimeExecutionEvent,
} from "@limecloud/agent-runtime-projection";

export type AgentMessageRole = "user" | "assistant" | "system" | string;

export interface AgentTimelineMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  model?: string;
  createdAt?: string;
}

export interface AgentTimelineProps<TMessage extends AgentTimelineMessage = AgentTimelineMessage> {
  messages?: readonly TMessage[];
  empty?: ReactNode;
  runningLabel?: ReactNode;
  messageTitle?: (message: TMessage) => ReactNode;
  messageMeta?: (message: TMessage) => ReactNode;
  messagePreview?: (message: TMessage) => ReactNode;
}

export type AgentRuntimeActionResolver<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> = (
  event: TEvent,
  action: AgentRuntimeActionProjection,
) => void;

export interface RuntimeFactsPanelProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  readModel: AgentRuntimeReadModel<TEvent>;
  artifact?: ReactNode;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
}

export interface RuntimeEventListProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  events: readonly AgentRuntimeEventProjection<TEvent>[];
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
}

export interface RuntimeFactsSummaryProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  readModel: AgentRuntimeReadModel<TEvent>;
}

export interface RuntimeFactCardProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  event: AgentRuntimeEventProjection<TEvent>;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
}

function defaultMessageTitle(message: AgentTimelineMessage): ReactNode {
  if (message.role === "user") return "用户";
  if (message.role === "assistant") return "助手";
  return "系统";
}

function defaultMessageMeta(message: AgentTimelineMessage): ReactNode {
  return message.createdAt ? new Date(message.createdAt).toLocaleString() : null;
}

function defaultMessagePreview(message: AgentTimelineMessage): ReactNode {
  return message.content.trim();
}

function roleLabel(role: AgentMessageRole): string {
  if (role === "user") return "用";
  if (role === "assistant") return "助";
  if (role === "system") return "系";
  return "讯";
}

export function AgentTimeline<TMessage extends AgentTimelineMessage = AgentTimelineMessage>({
  messages = [],
  empty,
  runningLabel,
  messageTitle = defaultMessageTitle as (message: TMessage) => ReactNode,
  messageMeta = defaultMessageMeta as (message: TMessage) => ReactNode,
  messagePreview = defaultMessagePreview as (message: TMessage) => ReactNode,
}: AgentTimelineProps<TMessage>) {
  return (
    <>
      {messages.length ? (
        messages.map((message) => {
          const preview = messagePreview(message);
          const rawContent = message.content.trim();
          const canExpand = typeof preview === "string" && preview !== rawContent;
          return (
            <article key={message.id} className={`agent-turn ${message.role}`} data-role={message.role}>
              <div className="agent-turn-avatar" aria-hidden="true">
                {roleLabel(message.role)}
              </div>
              <div className="agent-turn-body">
                <div className="agent-turn-head">
                  <strong>{messageTitle(message)}</strong>
                  <small>{messageMeta(message)}</small>
                </div>
                <p>{preview}</p>
                {message.model ? <small className="agent-turn-model">{message.model}</small> : null}
                {canExpand ? (
                  <details className="agent-turn-details">
                    <summary>{message.role === "user" ? "查看上下文" : "查看完整输出"}</summary>
                    <pre>{rawContent}</pre>
                  </details>
                ) : null}
              </div>
            </article>
          );
        })
      ) : empty === null ? null : (
        <div className="agent-empty-session">
          {empty === undefined ? (
            <>
              <strong>还没有消息</strong>
              <span>补齐输入源后开始记录本次协作。</span>
            </>
          ) : (
            empty
          )}
        </div>
      )}

      {runningLabel ? (
        <div className="agent-runtime-event">
          <strong>执行中</strong>
          <span>{runningLabel}</span>
        </div>
      ) : null}
    </>
  );
}

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
          {event.action.buttonLabel}
        </button>
      ) : (
        <em>{event.displayStatus}</em>
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
