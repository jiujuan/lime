import type { ReactNode } from "react";

import type { AgentRuntimeExecutionEvent } from "@limecloud/agent-ui-contracts";

import { AgentTimeline } from "./messages.js";
import { ArtifactRefList, EvidenceRefList } from "./refs.js";
import { ActionRequiredList, RuntimeEventList, RuntimeFactsSummary } from "./runtimeFacts.js";
import { SubagentsView } from "./subagents.js";
import { McpSurface, ToolCallSurface } from "./tools.js";
import type {
  AgentTimelineMessage,
  AgentWorkbenchTaskCardProps,
  AgentWorkbenchSurfaceProps,
  AgentWorkbenchTaskCheckpoint,
} from "./types.js";

function classNames(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

function defaultCheckpointClassName(checkpoint: AgentWorkbenchTaskCheckpoint): string {
  return checkpoint.state === "idle" ? "" : checkpoint.state;
}

export function AgentWorkbenchTaskCard({
  view,
  labels,
}: AgentWorkbenchTaskCardProps) {
  const sourceLabel = labels?.sourceLabel ?? "Sources";
  const artifactLabel = labels?.artifactLabel ?? "Artifacts";
  const taskLabel = labels?.taskLabel ?? "Task";
  const statusLabel = labels?.statusLabel ?? "Status";
  return (
    <section className="agent-workbench-task-card agents-thread-task-card" aria-label={String(taskLabel)}>
      <dl>
        <div>
          <dt>{sourceLabel}</dt>
          <dd>{view.sourceCount}</dd>
        </div>
        <div>
          <dt>{artifactLabel}</dt>
          <dd>{view.artifactCount}</dd>
        </div>
        <div>
          <dt>{taskLabel}</dt>
          <dd>{view.taskTitle}</dd>
        </div>
        <div>
          <dt>{statusLabel}</dt>
          <dd>{view.statusLabel}</dd>
        </div>
      </dl>
      <section>
        <span>{labels?.checkpointLabel ?? "Progress"}</span>
        <ul>
          {view.checkpoints.map((checkpoint) => (
            <li
              key={checkpoint.id}
              className={defaultCheckpointClassName(checkpoint)}
              data-checkpoint-id={checkpoint.id}
              data-checkpoint-state={checkpoint.state}
              data-checkpoint-count={checkpoint.count}
            >
              {checkpoint.title}
            </li>
          ))}
        </ul>
      </section>
      <footer>
        <span>{labels?.sourceLabel ?? "Sources"}</span>
        <em>{view.evidenceCount || view.sourceCount}</em>
      </footer>
    </section>
  );
}

export function AgentWorkbenchSurface<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
  TMessage extends AgentTimelineMessage = AgentTimelineMessage,
>({
  view,
  state,
  messages = [],
  className,
  toolbar,
  composer,
  emptyMessages,
  artifact,
  runtimePanelOpen = view.shouldShowRuntimePanel,
  onResolveAction,
  onSelectArtifactRef,
  onSelectEvidenceRef,
  onOpenSubagentThread,
  labels,
}: AgentWorkbenchSurfaceProps<TEvent, TMessage>) {
  const otherEvents = state.readModel.visibleEvents.filter(
    (event) => event.surface !== "human-action" && event.surface !== "tool",
  );
  const runtimePanel = runtimePanelOpen ? (
    <aside className="agent-workbench-runtime-panel open" aria-label={String(labels?.runtimeLabel ?? "Runtime facts")}>
      <header className="agent-workbench-panel-head">
        <span>{labels?.runtimeLabel ?? "Runtime facts"}</span>
        <strong>{view.sourceCount} / {view.toolCount} / {view.artifactCount}</strong>
      </header>
      <RuntimeFactsSummary
        readModel={state.readModel}
        ariaLabel={labels?.runtimeSummaryAriaLabel}
      />
      <ActionRequiredList
        actions={state.actions}
        onResolveAction={onResolveAction}
        ariaLabel={labels?.actionRequiredAriaLabel}
        actionButtonLabel={labels?.actionButtonLabel}
        eventStatusLabel={labels?.eventStatusLabel}
      />
      <ToolCallSurface
        surface={state.toolCalls}
        ariaLabel={labels?.toolCallsAriaLabel ?? labels?.toolGroupAriaLabel}
        toolFamilyLabel={labels?.toolFamilyLabel}
        toolTitle={labels?.toolTitle}
        toolMeta={labels?.toolMeta}
        toolPreview={labels?.toolPreview}
        toolStatusLabel={labels?.toolStatusLabel}
      />
      <McpSurface
        surface={state.mcp}
        ariaLabel={labels?.mcpSurfaceAriaLabel}
        serversAriaLabel={labels?.mcpServersAriaLabel}
        toolsAriaLabel={labels?.mcpToolsAriaLabel}
        serverTitle={labels?.mcpServerTitle}
        serverMeta={labels?.mcpServerMeta}
        toolTitle={labels?.mcpToolTitle}
        toolMeta={labels?.mcpToolMeta}
        toolPreview={labels?.mcpToolPreview}
        operationLabel={labels?.mcpOperationLabel}
        statusLabel={labels?.toolStatusLabel}
      />
      <RuntimeEventList
        events={otherEvents}
        onResolveAction={onResolveAction}
        ariaLabel={labels?.executionEventsAriaLabel}
        actionButtonLabel={labels?.actionButtonLabel}
        eventStatusLabel={labels?.eventStatusLabel}
      />
      <ArtifactRefList
        refs={state.artifacts}
        ariaLabel={labels?.artifactRefsAriaLabel}
        onSelectRef={onSelectArtifactRef}
      />
      <EvidenceRefList
        refs={state.evidence}
        ariaLabel={labels?.evidenceRefsAriaLabel}
        onSelectRef={onSelectEvidenceRef}
      />
      <SubagentsView
        state={state}
        onOpenThread={onOpenSubagentThread}
      />
    </aside>
  ) : null;

  return (
    <section
      className={classNames("agent-workbench-surface agents-workbench", className)}
      data-runtime={runtimePanelOpen ? "open" : "closed"}
      data-runtime-status={state.runtime.status}
      data-hydration-status={state.hydration.status}
    >
      <div className="agent-workbench-dialog-shell agents-dialog-shell">
      {toolbar ? <div className="agent-workbench-toolbar">{toolbar}</div> : null}
      <main className="agent-workbench-thread agents-thread" aria-label={String(labels?.messagePartsAriaLabel ?? "Agent workbench")} data-runtime={runtimePanelOpen ? "open" : "closed"}>
        <section className="agent-workbench-main agents-thread-main" aria-label="Conversation">
          <AgentWorkbenchTaskCard view={view} labels={labels} />
          <div className="agent-workbench-scroll agents-thread-scroll" aria-label={String(labels?.messagePartsAriaLabel ?? "Messages")}>
            <AgentTimeline
              messages={messages}
              empty={emptyMessages}
              roleLabel={labels?.roleLabel}
              messageTitle={labels?.messageTitle as ((message: TMessage) => ReactNode) | undefined}
              messageMeta={labels?.messageMeta as ((message: TMessage) => ReactNode) | undefined}
              messagePreview={labels?.messagePreview as ((message: TMessage) => ReactNode) | undefined}
            />
          </div>
          {artifact ? <div className="agent-workbench-artifact">{artifact}</div> : null}
        </section>
        {runtimePanel}
      </main>
      {composer ? <div className="agent-workbench-composer">{composer}</div> : null}
      </div>
    </section>
  );
}
