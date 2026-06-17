import type { ReactNode } from "react";

import type {
  AgentUiProjectionState,
  AgentUiArtifactRefView,
  AgentUiEvidenceRefView,
  AgentUiMcpOperationKind,
  AgentUiMcpServerView,
  AgentUiMcpSurfaceModel,
  AgentUiMcpToolCallView,
  AgentUiRefView,
  AgentUiSubagentActivityView,
  AgentUiSubagentDelegationView,
  AgentUiSubagentsModel,
  AgentUiSubagentThreadView,
  AgentUiToolCallView,
  AgentUiToolFamily,
  AgentUiToolSurfaceModel,
  AgentRuntimeActionProjection,
  AgentRuntimeEventProjection,
  AgentRuntimeExecutionEvent,
  AgentRuntimeExecutionEventStatus,
  AgentRuntimeReadModel,
  ExecutionGraphNode,
  ProcessTimelineEntry,
  UIMessagePart,
} from "@limecloud/agent-ui-contracts";

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
  runtimeStatusLabel?: ReactNode;
  contextDetailsLabel?: ReactNode;
  fullOutputDetailsLabel?: ReactNode;
  roleLabel?: (role: AgentMessageRole) => string;
  messageTitle?: (message: TMessage) => ReactNode;
  messageMeta?: (message: TMessage) => ReactNode;
  messagePreview?: (message: TMessage) => ReactNode;
}

export type AgentWorkbenchTaskCheckpointState = "done" | "active" | "idle" | "blocked";

export interface AgentWorkbenchTaskCheckpoint {
  id: "input" | "artifact" | "human-action" | "evidence" | string;
  title: string;
  state: AgentWorkbenchTaskCheckpointState;
  count: number;
}

export interface AgentWorkbenchTaskView {
  taskTitle: string;
  statusLabel: string;
  sourceCount: number;
  toolCount: number;
  pendingActionCount: number;
  artifactCount: number;
  evidenceCount: number;
  taskCount: number;
  hasRuntimeFacts: boolean;
  shouldShowRuntimePanel: boolean;
  checkpoints: AgentWorkbenchTaskCheckpoint[];
}

export interface AgentWorkbenchTaskCardProps {
  view: AgentWorkbenchTaskView;
  labels?: Pick<
    AgentWorkbenchTaskSurfaceLabels,
    "sourceLabel" | "artifactLabel" | "taskLabel" | "statusLabel" | "checkpointLabel"
  >;
}

export interface AgentWorkbenchTaskSurfaceLabels {
  workspaceLabel?: ReactNode;
  taskLabel?: ReactNode;
  statusLabel?: ReactNode;
  sourceLabel?: ReactNode;
  artifactLabel?: ReactNode;
  checkpointLabel?: ReactNode;
  runtimeLabel?: ReactNode;
  messagePartsAriaLabel?: string;
  runtimeSummaryAriaLabel?: string;
  executionEventsAriaLabel?: string;
  actionRequiredAriaLabel?: string;
  artifactRefsAriaLabel?: string;
  evidenceRefsAriaLabel?: string;
  toolGroupAriaLabel?: string;
  toolCallsAriaLabel?: string;
  mcpSurfaceAriaLabel?: string;
  mcpServersAriaLabel?: string;
  mcpToolsAriaLabel?: string;
  roleLabel?: (role: AgentMessageRole) => string;
  messageTitle?: (message: AgentTimelineMessage) => ReactNode;
  messageMeta?: (message: AgentTimelineMessage) => ReactNode;
  messagePreview?: (message: AgentTimelineMessage) => ReactNode;
  actionButtonLabel?: (action: AgentRuntimeActionProjection) => ReactNode;
  eventStatusLabel?: (event: AgentRuntimeEventProjection) => ReactNode;
  toolFamilyLabel?: (family: AgentUiToolFamily) => ReactNode;
  toolStatusLabel?: (status: AgentRuntimeExecutionEventStatus) => ReactNode;
  toolTitle?: (tool: AgentUiToolCallView) => ReactNode;
  toolMeta?: (tool: AgentUiToolCallView) => ReactNode;
  toolPreview?: (tool: AgentUiToolCallView) => ReactNode;
  mcpOperationLabel?: (operation: AgentUiMcpOperationKind) => ReactNode;
  mcpServerTitle?: (server: AgentUiMcpServerView) => ReactNode;
  mcpServerMeta?: (server: AgentUiMcpServerView) => ReactNode;
  mcpToolTitle?: (tool: AgentUiMcpToolCallView) => ReactNode;
  mcpToolMeta?: (tool: AgentUiMcpToolCallView) => ReactNode;
  mcpToolPreview?: (tool: AgentUiMcpToolCallView) => ReactNode;
}

export interface AgentWorkbenchSurfaceProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent, TMessage extends AgentTimelineMessage = AgentTimelineMessage> {
  view: AgentWorkbenchTaskView;
  state: AgentUiProjectionState<TEvent>;
  messages?: readonly TMessage[];
  className?: string;
  toolbar?: ReactNode;
  composer?: ReactNode;
  emptyMessages?: ReactNode;
  artifact?: ReactNode;
  runtimePanelOpen?: boolean;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
  onSelectArtifactRef?: ArtifactRefListProps["onSelectRef"];
  onSelectEvidenceRef?: EvidenceRefListProps["onSelectRef"];
  onOpenSubagentThread?: SubagentsViewProps["onOpenThread"];
  labels?: AgentWorkbenchTaskSurfaceLabels;
}

export type AgentRuntimeActionResolver<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> = (
  event: TEvent,
  action: AgentRuntimeActionProjection,
) => void;

export interface RuntimeFactsPanelProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  readModel: AgentRuntimeReadModel<TEvent>;
  artifact?: ReactNode;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
  labels?: Pick<
    AgentUiProjectionViewLabels<TEvent>,
    | "runtimeSummaryAriaLabel"
    | "executionEventsAriaLabel"
    | "summaryLabels"
    | "actionButtonLabel"
    | "eventStatusLabel"
  >;
}

export interface RuntimeEventListProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  events: readonly AgentRuntimeEventProjection<TEvent>[];
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
  ariaLabel?: string;
  actionButtonLabel?: (action: AgentRuntimeActionProjection) => ReactNode;
  eventStatusLabel?: (event: AgentRuntimeEventProjection<TEvent>) => ReactNode;
}

export interface RuntimeFactsSummaryProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  readModel: AgentRuntimeReadModel<TEvent>;
  ariaLabel?: string;
  summaryLabels?: Partial<Record<"sources" | "actions" | "artifacts" | "evidence", ReactNode>>;
}

export interface RuntimeFactCardProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  event: AgentRuntimeEventProjection<TEvent>;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
  actionButtonLabel?: (action: AgentRuntimeActionProjection) => ReactNode;
  eventStatusLabel?: (event: AgentRuntimeEventProjection<TEvent>) => ReactNode;
}

export interface ToolGroupProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  tools?: readonly AgentRuntimeEventProjection<TEvent>[];
  empty?: ReactNode;
  ariaLabel?: string;
  eventStatusLabel?: (event: AgentRuntimeEventProjection<TEvent>) => ReactNode;
}

export interface ToolCallCardProps {
  tool: AgentUiToolCallView;
  toolFamilyLabel?: (family: AgentUiToolFamily) => ReactNode;
  toolTitle?: (tool: AgentUiToolCallView) => ReactNode;
  toolMeta?: (tool: AgentUiToolCallView) => ReactNode;
  toolPreview?: (tool: AgentUiToolCallView) => ReactNode;
  statusLabel?: (status: AgentRuntimeExecutionEventStatus) => ReactNode;
}

export interface ToolCallSurfaceProps {
  surface?: AgentUiToolSurfaceModel;
  empty?: ReactNode;
  ariaLabel?: string;
  toolFamilyLabel?: ToolCallCardProps["toolFamilyLabel"];
  toolTitle?: ToolCallCardProps["toolTitle"];
  toolMeta?: ToolCallCardProps["toolMeta"];
  toolPreview?: ToolCallCardProps["toolPreview"];
  toolStatusLabel?: ToolCallCardProps["statusLabel"];
}

export interface McpServerListProps {
  servers?: readonly AgentUiMcpServerView[];
  empty?: ReactNode;
  ariaLabel?: string;
  serverTitle?: (server: AgentUiMcpServerView) => ReactNode;
  serverMeta?: (server: AgentUiMcpServerView) => ReactNode;
  statusLabel?: (status: AgentRuntimeExecutionEventStatus) => ReactNode;
}

export interface McpToolListProps {
  tools?: readonly AgentUiMcpToolCallView[];
  empty?: ReactNode;
  ariaLabel?: string;
  toolTitle?: (tool: AgentUiMcpToolCallView) => ReactNode;
  toolMeta?: (tool: AgentUiMcpToolCallView) => ReactNode;
  toolPreview?: (tool: AgentUiMcpToolCallView) => ReactNode;
  operationLabel?: (operation: AgentUiMcpOperationKind) => ReactNode;
  statusLabel?: (status: AgentRuntimeExecutionEventStatus) => ReactNode;
}

export interface McpSurfaceProps {
  surface?: AgentUiMcpSurfaceModel;
  empty?: ReactNode;
  ariaLabel?: string;
  serversAriaLabel?: string;
  toolsAriaLabel?: string;
  serverTitle?: McpServerListProps["serverTitle"];
  serverMeta?: McpServerListProps["serverMeta"];
  toolTitle?: McpToolListProps["toolTitle"];
  toolMeta?: McpToolListProps["toolMeta"];
  toolPreview?: McpToolListProps["toolPreview"];
  operationLabel?: McpToolListProps["operationLabel"];
  statusLabel?: McpToolListProps["statusLabel"];
}

export interface ActionRequiredListProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  actions?: readonly AgentRuntimeEventProjection<TEvent>[];
  empty?: ReactNode;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
  ariaLabel?: string;
  actionButtonLabel?: (action: AgentRuntimeActionProjection) => ReactNode;
  eventStatusLabel?: (event: AgentRuntimeEventProjection<TEvent>) => ReactNode;
}

export interface UIMessagePartsViewProps {
  parts?: readonly UIMessagePart[];
  empty?: ReactNode;
  ariaLabel?: string;
  roleLabel?: (role: AgentMessageRole) => string;
  partTitle?: (part: UIMessagePart) => ReactNode;
  partMeta?: (part: UIMessagePart) => ReactNode;
  partPreview?: (part: UIMessagePart) => ReactNode;
}

export interface ProcessTimelineViewProps {
  entries?: readonly ProcessTimelineEntry[];
  empty?: ReactNode;
  ariaLabel?: string;
  entryTitle?: (entry: ProcessTimelineEntry) => ReactNode;
  entryMeta?: (entry: ProcessTimelineEntry) => ReactNode;
}

export interface ExecutionGraphViewProps {
  nodes?: readonly ExecutionGraphNode[];
  empty?: ReactNode;
  ariaLabel?: string;
  nodeTitle?: (node: ExecutionGraphNode) => ReactNode;
  nodeMeta?: (node: ExecutionGraphNode) => ReactNode;
}

export interface AgentUiRefListProps<TRef extends AgentUiRefView = AgentUiRefView> {
  refs?: readonly TRef[];
  empty?: ReactNode;
  ariaLabel?: string;
  className?: string;
  refKind?: string;
  refTitle?: (ref: TRef) => ReactNode;
  refMeta?: (ref: TRef) => ReactNode;
  refPreview?: (ref: TRef) => ReactNode;
  refActionLabel?: (ref: TRef) => ReactNode;
  onSelectRef?: (ref: TRef) => void;
}

export type ArtifactRefListProps = AgentUiRefListProps<AgentUiArtifactRefView>;

export type EvidenceRefListProps = AgentUiRefListProps<AgentUiEvidenceRefView>;

export interface AgentUiProjectionViewLabels<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  messagePartsAriaLabel?: string;
  processTimelineAriaLabel?: string;
  executionGraphAriaLabel?: string;
  artifactRefsAriaLabel?: string;
  evidenceRefsAriaLabel?: string;
  subagentsAriaLabel?: string;
  subagentThreadsAriaLabel?: string;
  subagentDelegationsAriaLabel?: string;
  subagentActivitiesAriaLabel?: string;
  runtimeSummaryAriaLabel?: string;
  executionEventsAriaLabel?: string;
  toolGroupAriaLabel?: string;
  toolCallsAriaLabel?: string;
  mcpSurfaceAriaLabel?: string;
  mcpServersAriaLabel?: string;
  mcpToolsAriaLabel?: string;
  actionRequiredAriaLabel?: string;
  summaryLabels?: RuntimeFactsSummaryProps<TEvent>["summaryLabels"];
  roleLabel?: UIMessagePartsViewProps["roleLabel"];
  messagePartTitle?: UIMessagePartsViewProps["partTitle"];
  messagePartMeta?: UIMessagePartsViewProps["partMeta"];
  messagePartPreview?: UIMessagePartsViewProps["partPreview"];
  timelineEntryTitle?: ProcessTimelineViewProps["entryTitle"];
  timelineEntryMeta?: ProcessTimelineViewProps["entryMeta"];
  graphNodeTitle?: ExecutionGraphViewProps["nodeTitle"];
  graphNodeMeta?: ExecutionGraphViewProps["nodeMeta"];
  artifactRefTitle?: ArtifactRefListProps["refTitle"];
  artifactRefMeta?: ArtifactRefListProps["refMeta"];
  artifactRefPreview?: ArtifactRefListProps["refPreview"];
  artifactRefActionLabel?: ArtifactRefListProps["refActionLabel"];
  evidenceRefTitle?: EvidenceRefListProps["refTitle"];
  evidenceRefMeta?: EvidenceRefListProps["refMeta"];
  evidenceRefPreview?: EvidenceRefListProps["refPreview"];
  evidenceRefActionLabel?: EvidenceRefListProps["refActionLabel"];
  subagentThreadTitle?: SubagentThreadListProps["threadTitle"];
  subagentThreadMeta?: SubagentThreadListProps["threadMeta"];
  subagentThreadSummary?: SubagentThreadListProps["threadSummary"];
  subagentDelegationTitle?: SubagentDelegationListProps["delegationTitle"];
  subagentActivityTitle?: SubagentActivityListProps["activityTitle"];
  subagentActivityMeta?: SubagentActivityListProps["activityMeta"];
  actionButtonLabel?: RuntimeFactCardProps<TEvent>["actionButtonLabel"];
  eventStatusLabel?: RuntimeFactCardProps<TEvent>["eventStatusLabel"];
  toolFamilyLabel?: (family: AgentUiToolFamily) => ReactNode;
  toolStatusLabel?: ToolCallSurfaceProps["toolStatusLabel"];
  toolTitle?: ToolCallSurfaceProps["toolTitle"];
  toolMeta?: ToolCallSurfaceProps["toolMeta"];
  toolPreview?: ToolCallSurfaceProps["toolPreview"];
  mcpOperationLabel?: McpToolListProps["operationLabel"];
  mcpServerTitle?: McpSurfaceProps["serverTitle"];
  mcpServerMeta?: McpSurfaceProps["serverMeta"];
  mcpToolTitle?: McpSurfaceProps["toolTitle"];
  mcpToolMeta?: McpSurfaceProps["toolMeta"];
  mcpToolPreview?: McpSurfaceProps["toolPreview"];
}

export interface AgentUiProjectionViewProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  state: AgentUiProjectionState<TEvent>;
  artifact?: ReactNode;
  emptyMessages?: ReactNode;
  labels?: AgentUiProjectionViewLabels<TEvent>;
  onResolveAction?: AgentRuntimeActionResolver<TEvent>;
  onSelectArtifactRef?: ArtifactRefListProps["onSelectRef"];
  onSelectEvidenceRef?: EvidenceRefListProps["onSelectRef"];
  onOpenSubagentThread?: SubagentsViewProps["onOpenThread"];
}

export interface SubagentThreadListProps {
  threads?: readonly AgentUiSubagentThreadView[];
  empty?: ReactNode;
  ariaLabel?: string;
  threadTitle?: (thread: AgentUiSubagentThreadView) => ReactNode;
  threadMeta?: (thread: AgentUiSubagentThreadView) => ReactNode;
  threadSummary?: (thread: AgentUiSubagentThreadView) => ReactNode;
  threadActionLabel?: (thread: AgentUiSubagentThreadView) => ReactNode;
  onOpenThread?: (thread: AgentUiSubagentThreadView) => void;
}

export interface SubagentDelegationListProps {
  delegations?: readonly AgentUiSubagentDelegationView[];
  empty?: ReactNode;
  ariaLabel?: string;
  delegationTitle?: (delegation: AgentUiSubagentDelegationView) => ReactNode;
}

export interface SubagentActivityListProps {
  activities?: readonly AgentUiSubagentActivityView[];
  empty?: ReactNode;
  ariaLabel?: string;
  activityTitle?: (activity: AgentUiSubagentActivityView) => ReactNode;
  activityMeta?: (activity: AgentUiSubagentActivityView) => ReactNode;
}

export interface SubagentsViewProps<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  state?: AgentUiProjectionState<TEvent>;
  model?: AgentUiSubagentsModel;
  emptyThreads?: ReactNode;
  emptyDelegations?: ReactNode;
  emptyActivities?: ReactNode;
  onOpenThread?: (thread: AgentUiSubagentThreadView) => void;
  labels?: Pick<
    AgentUiProjectionViewLabels<TEvent>,
    | "subagentsAriaLabel"
    | "subagentThreadsAriaLabel"
    | "subagentDelegationsAriaLabel"
    | "subagentActivitiesAriaLabel"
    | "subagentThreadTitle"
    | "subagentThreadMeta"
    | "subagentThreadSummary"
    | "subagentDelegationTitle"
    | "subagentActivityTitle"
    | "subagentActivityMeta"
  >;
}
