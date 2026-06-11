import type { AgentRuntimeExecutionEvent } from "@limecloud/agent-ui-contracts";

import { ExecutionGraphView } from "./executionGraph.js";
import { UIMessagePartsView } from "./messages.js";
import { ProcessTimelineView } from "./processTimeline.js";
import { ArtifactRefList, EvidenceRefList } from "./refs.js";
import { ActionRequiredList, RuntimeEventList, RuntimeFactsSummary, ToolGroup } from "./runtimeFacts.js";
import { SubagentsView } from "./subagents.js";
import type { AgentUiProjectionViewProps } from "./types.js";

export function AgentUiProjectionView<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent>({
  state,
  artifact,
  emptyMessages,
  labels,
  onResolveAction,
  onSelectArtifactRef,
  onSelectEvidenceRef,
  onOpenSubagentThread,
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
        <UIMessagePartsView
          parts={state.messages}
          empty={emptyMessages}
          ariaLabel={labels?.messagePartsAriaLabel}
          roleLabel={labels?.roleLabel}
          partTitle={labels?.messagePartTitle}
          partMeta={labels?.messagePartMeta}
          partPreview={labels?.messagePartPreview}
        />
        <ProcessTimelineView
          entries={state.timeline}
          ariaLabel={labels?.processTimelineAriaLabel}
          entryTitle={labels?.timelineEntryTitle}
          entryMeta={labels?.timelineEntryMeta}
        />
      </div>
      <aside className="agent-ui-sidecar">
        <RuntimeFactsSummary
          readModel={state.readModel}
          ariaLabel={labels?.runtimeSummaryAriaLabel}
          summaryLabels={labels?.summaryLabels}
        />
        <ActionRequiredList
          actions={state.actions}
          onResolveAction={onResolveAction}
          ariaLabel={labels?.actionRequiredAriaLabel}
          actionButtonLabel={labels?.actionButtonLabel}
          eventStatusLabel={labels?.eventStatusLabel}
        />
        <ToolGroup
          tools={state.tools}
          ariaLabel={labels?.toolGroupAriaLabel}
          eventStatusLabel={labels?.eventStatusLabel}
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
          refTitle={labels?.artifactRefTitle}
          refMeta={labels?.artifactRefMeta}
          refPreview={labels?.artifactRefPreview}
          refActionLabel={labels?.artifactRefActionLabel}
          onSelectRef={onSelectArtifactRef}
        />
        <EvidenceRefList
          refs={state.evidence}
          ariaLabel={labels?.evidenceRefsAriaLabel}
          refTitle={labels?.evidenceRefTitle}
          refMeta={labels?.evidenceRefMeta}
          refPreview={labels?.evidenceRefPreview}
          refActionLabel={labels?.evidenceRefActionLabel}
          onSelectRef={onSelectEvidenceRef}
        />
        <SubagentsView
          state={state}
          labels={labels}
          onOpenThread={onOpenSubagentThread}
        />
        {artifact ? <div className="agent-session-artifact">{artifact}</div> : null}
        <ExecutionGraphView
          nodes={state.graph}
          ariaLabel={labels?.executionGraphAriaLabel}
          nodeTitle={labels?.graphNodeTitle}
          nodeMeta={labels?.graphNodeMeta}
        />
      </aside>
    </section>
  );
}
