import type {
  AgentRuntimeExecutionEvent,
  AgentUiSubagentActivityView,
  AgentUiSubagentDelegationView,
  AgentUiSubagentThreadView,
} from "@limecloud/agent-ui-contracts";

import type {
  SubagentActivityListProps,
  SubagentDelegationListProps,
  SubagentsViewProps,
  SubagentThreadListProps,
} from "./types.js";

function defaultThreadTitle(thread: AgentUiSubagentThreadView) {
  return thread.nickname ?? thread.role ?? thread.title;
}

function defaultThreadMeta(thread: AgentUiSubagentThreadView) {
  return [thread.status, thread.taskPath ?? thread.threadId]
    .filter(Boolean)
    .join(" / ");
}

function defaultThreadSummary(thread: AgentUiSubagentThreadView) {
  return thread.summary ?? thread.promptPreview;
}

function defaultDelegationTitle(delegation: AgentUiSubagentDelegationView) {
  return `${delegation.action}: ${delegation.title}`;
}

function defaultActivityTitle(activity: AgentUiSubagentActivityView) {
  return activity.title;
}

function defaultActivityMeta(activity: AgentUiSubagentActivityView) {
  return `${activity.kind} / ${activity.status}`;
}

export function SubagentThreadList({
  threads = [],
  empty,
  ariaLabel = "Subagent threads",
  threadTitle = defaultThreadTitle,
  threadMeta = defaultThreadMeta,
  threadSummary = defaultThreadSummary,
  threadActionLabel,
  onOpenThread,
}: SubagentThreadListProps) {
  if (!threads.length) {
    return empty === undefined ? null : <div className="agent-subagent-threads-empty">{empty}</div>;
  }
  return (
    <div className="agent-subagent-threads" aria-label={ariaLabel}>
      {threads.map((thread) => (
        <article
          key={thread.threadId}
          className={`agent-subagent-thread ${thread.status}`}
          data-thread-id={thread.threadId}
          data-subagent-id={thread.subagentId}
          data-parent-thread-id={thread.parentThreadId}
          data-task-id={thread.taskId}
          data-subagent-status={thread.status}
        >
          <div>
            <small>{threadMeta(thread)}</small>
            <strong>{threadTitle(thread)}</strong>
            {threadSummary(thread) ? <p>{threadSummary(thread)}</p> : null}
          </div>
          {onOpenThread ? (
            <button type="button" onClick={() => onOpenThread(thread)}>
              {threadActionLabel ? threadActionLabel(thread) : "Open"}
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function SubagentDelegationList({
  delegations = [],
  empty,
  ariaLabel = "Subagent delegations",
  delegationTitle = defaultDelegationTitle,
}: SubagentDelegationListProps) {
  if (!delegations.length) {
    return empty === undefined ? null : <div className="agent-subagent-delegations-empty">{empty}</div>;
  }
  return (
    <div className="agent-subagent-delegations" aria-label={ariaLabel}>
      {delegations.map((delegation) => (
        <article
          key={delegation.callId}
          className={`agent-subagent-delegation ${delegation.status}`}
          data-delegation-call-id={delegation.callId}
          data-delegation-action={delegation.action}
          data-parent-thread-id={delegation.parentThreadId}
          data-target-thread-ids={delegation.targetThreadIds.join(" ")}
        >
          <small>{delegation.status}</small>
          <strong>{delegationTitle(delegation)}</strong>
          {delegation.promptPreview ? <p>{delegation.promptPreview}</p> : null}
        </article>
      ))}
    </div>
  );
}

export function SubagentActivityList({
  activities = [],
  empty,
  ariaLabel = "Subagent activities",
  activityTitle = defaultActivityTitle,
  activityMeta = defaultActivityMeta,
}: SubagentActivityListProps) {
  if (!activities.length) {
    return empty === undefined ? null : <div className="agent-subagent-activities-empty">{empty}</div>;
  }
  return (
    <div className="agent-subagent-activities" aria-label={ariaLabel}>
      {activities.map((activity) => (
        <article
          key={activity.activityId}
          className={`agent-subagent-activity ${activity.status}`}
          data-activity-id={activity.activityId}
          data-thread-id={activity.threadId}
          data-activity-kind={activity.kind}
          data-source-event-id={activity.sourceEventId}
        >
          <small>{activityMeta(activity)}</small>
          <strong>{activityTitle(activity)}</strong>
        </article>
      ))}
    </div>
  );
}

export function SubagentsView<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  state,
  model: modelProp,
  emptyThreads,
  emptyDelegations,
  emptyActivities,
  labels,
  onOpenThread,
}: SubagentsViewProps<TEvent>) {
  const model = modelProp ?? state?.subagents;

  if (!model?.hasSubagents) {
    return null;
  }

  return (
    <section
      className="agent-subagents"
      aria-label={labels?.subagentsAriaLabel ?? "Subagents"}
      data-subagent-count={model.threads.length}
      data-delegation-count={model.delegationCalls.length}
      data-activity-count={model.activities.length}
      data-active-subagent-count={model.activeThreadIds.length}
    >
      <SubagentThreadList
        threads={model.threads}
        empty={emptyThreads}
        ariaLabel={labels?.subagentThreadsAriaLabel}
        threadTitle={labels?.subagentThreadTitle}
        threadMeta={labels?.subagentThreadMeta}
        threadSummary={labels?.subagentThreadSummary}
        onOpenThread={onOpenThread}
      />
      <SubagentDelegationList
        delegations={model.delegationCalls}
        empty={emptyDelegations}
        ariaLabel={labels?.subagentDelegationsAriaLabel}
        delegationTitle={labels?.subagentDelegationTitle}
      />
      <SubagentActivityList
        activities={model.activities}
        empty={emptyActivities}
        ariaLabel={labels?.subagentActivitiesAriaLabel}
        activityTitle={labels?.subagentActivityTitle}
        activityMeta={labels?.subagentActivityMeta}
      />
    </section>
  );
}
