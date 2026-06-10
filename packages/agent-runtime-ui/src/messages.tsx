import type { ReactNode } from "react";

import {
  defaultMessageMeta,
  defaultMessagePartMeta,
  defaultMessagePartPreview,
  defaultMessagePartTitle,
  defaultMessagePreview,
  defaultMessageTitle,
  roleLabel as defaultRoleLabel,
} from "./labels.js";
import type { AgentTimelineMessage, AgentTimelineProps, UIMessagePartsViewProps } from "./types.js";

export function AgentTimeline<TMessage extends AgentTimelineMessage = AgentTimelineMessage>({
  messages = [],
  empty,
  runningLabel,
  runtimeStatusLabel = "Running",
  contextDetailsLabel = "View context",
  fullOutputDetailsLabel = "View full output",
  roleLabel = defaultRoleLabel,
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
                    <summary>{message.role === "user" ? contextDetailsLabel : fullOutputDetailsLabel}</summary>
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
              <strong>No messages yet</strong>
              <span>Add input sources to begin recording this collaboration.</span>
            </>
          ) : (
            empty
          )}
        </div>
      )}

      {runningLabel ? (
        <div className="agent-runtime-event">
          <strong>{runtimeStatusLabel}</strong>
          <span>{runningLabel}</span>
        </div>
      ) : null}
    </>
  );
}

export function UIMessagePartsView({
  parts = [],
  empty,
  ariaLabel = "Message parts",
  roleLabel = defaultRoleLabel,
  partTitle = defaultMessagePartTitle,
  partMeta = defaultMessagePartMeta,
  partPreview = defaultMessagePartPreview,
}: UIMessagePartsViewProps) {
  if (!parts.length) {
    if (empty === null) return null;
    return (
      <div className="agent-empty-session">
        {empty === undefined ? (
          <>
            <strong>No messages yet</strong>
            <span>Add input sources to begin recording this collaboration.</span>
          </>
        ) : (
          empty
        )}
      </div>
    );
  }
  return (
    <div className="agent-message-parts" aria-label={ariaLabel}>
      {parts.map((part) => (
        <article
          key={part.partId}
          className={`agent-message-part ${part.type}`}
          data-part-type={part.type}
          data-part-state={part.state}
          data-role={part.role}
        >
          <div className="agent-turn-avatar" aria-hidden="true">
            {roleLabel(part.role ?? "system")}
          </div>
          <div className="agent-turn-body">
            <div className="agent-turn-head">
              <strong>{partTitle(part)}</strong>
              <small>{partMeta(part)}</small>
            </div>
            <p>{partPreview(part)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
