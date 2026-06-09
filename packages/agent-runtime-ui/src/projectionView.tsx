import type { AgentRuntimeExecutionEvent } from "@limecloud/agent-ui-contracts";

import { ExecutionGraphView } from "./executionGraph.js";
import { UIMessagePartsView } from "./messages.js";
import { ProcessTimelineView } from "./processTimeline.js";
import { ActionRequiredList, RuntimeEventList, RuntimeFactsSummary, ToolGroup } from "./runtimeFacts.js";
import type { AgentUiProjectionViewProps } from "./types.js";

export function AgentUiProjectionView<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  state,
  artifact,
  emptyMessages,
  onResolveAction,
}: AgentUiProjectionViewProps<TEvent>) {
  const otherEvents = state.readModel.visibleEvents.filter(
    (event) => event.surface !== "human-action" && event.surface !== "tool",
  );
  return (
    <section
      className="agent-ui-projection"
      data-runtime-status={state.runtime.status}
      data-hydration-status={state.hydration.status}
    >
      <div className="agent-ui-main">
        <UIMessagePartsView parts={state.messages} empty={emptyMessages} />
        <ProcessTimelineView entries={state.timeline} />
      </div>
      <aside className="agent-ui-sidecar">
        <RuntimeFactsSummary readModel={state.readModel} />
        <ActionRequiredList actions={state.actions} onResolveAction={onResolveAction} />
        <ToolGroup tools={state.tools} />
        <RuntimeEventList events={otherEvents} onResolveAction={onResolveAction} />
        {artifact ? <div className="agent-session-artifact">{artifact}</div> : null}
        <ExecutionGraphView nodes={state.graph} />
      </aside>
    </section>
  );
}
